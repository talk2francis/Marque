#!/usr/bin/env bash
# Blue/green web deploy: build a candidate, prove it on a spare port, then swap.
#
#   bash scripts/deploy-bluegreen.sh            build, verify, swap, smoke
#   bash scripts/deploy-bluegreen.sh --rollback swap the previous build back
#
# The live server is never touched until the candidate has passed
# scripts/verify-candidate.mjs (every route at three widths, no console errors, no
# horizontal scroll). The previous build is kept at .next/standalone-prev, and a
# failed post-swap smoke test rolls back automatically.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB="$ROOT/apps/web"
PORT_CANDIDATE="${PORT_CANDIDATE:-3299}"
PUBLIC_URL="${PUBLIC_URL:-https://marque.trade}"
LOG_DIR="${LOG_DIR:-/root/.marque/deploys}"
mkdir -p "$LOG_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG="$LOG_DIR/deploy-$STAMP.log"

say() { echo "[deploy $(date -u +%H:%M:%S)] $*" | tee -a "$LOG"; }

kill_port() {
  local pid
  pid="$(ss -ltnp 2>/dev/null | grep ":$1 " | grep -oP 'pid=\K[0-9]+' | head -1 || true)"
  if [ -n "$pid" ]; then kill "$pid" 2>/dev/null || true; sleep 1; fi
}

smoke() {
  local base="$1" fails=0
  # /register renders its list client-side, so its data API is checked directly:
  # it once returned 503 for every visitor while /register itself answered 200.
  for u in / /status /register /standard /api/health "/api/v1/agents?limit=2" /api/v1/funnel "/api/v1/marketplace?limit=3&offset=0"; do
    code="$(curl -s -o /dev/null -w '%{http_code}' -m 90 "$base$u" || echo 000)"
    echo "  $code $u" | tee -a "$LOG"
    [ "$code" = "200" ] || fails=$((fails + 1))
  done
  css="$(curl -s -m 30 "$base/" | grep -oE '/_next/static/[^"]+\.css' | head -1 || true)"
  if [ -n "$css" ]; then
    code="$(curl -s -o /dev/null -w '%{http_code}' -m 30 "$base$css")"
    echo "  $code $css" | tee -a "$LOG"
    [ "$code" = "200" ] || fails=$((fails + 1))
  else
    echo "  no stylesheet found on /" | tee -a "$LOG"; fails=$((fails + 1))
  fi
  return "$fails"
}

swap_back() {
  cd "$WEB/.next"
  [ -d standalone-prev ] || { say "no previous build to roll back to"; exit 1; }
  rm -rf standalone-failed && mv standalone standalone-failed && mv standalone-prev standalone
  pm2 restart marque-web --update-env >/dev/null
  say "rolled back to the previous build (failed one kept at .next/standalone-failed)"
}

if [ "${1:-}" = "--rollback" ]; then swap_back; exit 0; fi

cd "$ROOT"
say "commit $(git rev-parse --short HEAD) on $(git rev-parse --abbrev-ref HEAD), log $LOG"
kill_port "$PORT_CANDIDATE"
rm -rf "$WEB/.next-verify"

say "building candidate (memory capped)"
systemd-run --user --scope -q -p MemoryMax=5G -p MemorySwapMax=3G \
  --setenv=MARQUE_BUILD_DIR=.next-verify nice -n 5 bash scripts/build-web.sh >>"$LOG" 2>&1

say "starting candidate on :$PORT_CANDIDATE"
(
  cd "$WEB"
  set -a; . /root/.marque/secrets.env; set +a
  PORT="$PORT_CANDIDATE" HOSTNAME=127.0.0.1 NODE_ENV=production \
    nohup node .next-verify/standalone/apps/web/server.js >>"$LOG_DIR/candidate-$STAMP.log" 2>&1 &
)
for _ in $(seq 1 30); do curl -s -o /dev/null -m 2 "http://127.0.0.1:$PORT_CANDIDATE/api/health" && break; sleep 1; done

say "verifying candidate"
if ! node scripts/verify-candidate.mjs "http://127.0.0.1:$PORT_CANDIDATE" >>"$LOG" 2>&1; then
  grep -E "FAIL|combinations" "$LOG" | tail -12
  kill_port "$PORT_CANDIDATE"
  say "candidate FAILED verification; production untouched"
  exit 1
fi
grep -E "combinations" "$LOG" | tail -1
kill_port "$PORT_CANDIDATE"

say "swapping"
cd "$WEB/.next"
rm -rf standalone-new && cp -r ../.next-verify/standalone standalone-new
rm -rf standalone-prev && mv standalone standalone-prev && mv standalone-new standalone
pm2 restart marque-web --update-env >/dev/null
for _ in $(seq 1 30); do curl -s -o /dev/null -m 2 "http://127.0.0.1:${WEB_PORT:-3200}/api/health" && break; sleep 1; done

say "smoke test against $PUBLIC_URL"
if ! smoke "$PUBLIC_URL"; then
  say "smoke FAILED, rolling back"
  swap_back
  exit 1
fi
say "deployed $(git -C "$ROOT" rev-parse --short HEAD)"
