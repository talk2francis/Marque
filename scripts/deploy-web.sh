#!/usr/bin/env bash
# Blue/green web deploy behind Caddy (P2-11, LAUNCH-RUNBOOK 13.8 "Deploy" rung 1).
#
#   bash scripts/deploy-web.sh              build HEAD, start it on the idle port, verify, switch, retire the old slot in 5 min
#   bash scripts/deploy-web.sh --rollback   start the previous slot again (if it was retired) and switch Caddy back to it
#   bash scripts/deploy-web.sh --status     which port is live and which release each slot runs
#
# Two slots: marque-web on 3200 and marque-web-b on 3201 (ecosystem.config.cjs). Each runs
# releases/slot-<port>, a symlink to releases/<sha> (a copy of the standalone build). Caddy
# reads its upstream from /etc/caddy/marque-upstream.caddy; switching rewrites that one line
# and reloads Caddy, which is graceful: in-flight requests finish on the old upstream. The
# old slot keeps running for 5 minutes, then stops, so a rollback inside that window is a
# single Caddy reload.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB="$ROOT/apps/web"
REL="$ROOT/releases"
UPSTREAM=/etc/caddy/marque-upstream.caddy
PUBLIC_URL="${PUBLIC_URL:-https://marque.trade}"
RETIRE_AFTER="${RETIRE_AFTER:-300}"
LOG_DIR="${LOG_DIR:-/root/.marque/deploys}"
mkdir -p "$LOG_DIR" "$REL"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG="$LOG_DIR/deploy-web-$STAMP.log"

say() { echo "[deploy-web $(date -u +%H:%M:%S)] $*" | tee -a "$LOG"; }
name_of() { [ "$1" = 3200 ] && echo marque-web || echo marque-web-b; }
live_port() { grep -oP '127\.0\.0\.1:\K[0-9]+' "$UPSTREAM" 2>/dev/null || echo 3200; }
other() { [ "$1" = 3200 ] && echo 3201 || echo 3200; }

switch_to() {
  local port="$1" tmp
  tmp="$(mktemp)"
  printf 'reverse_proxy 127.0.0.1:%s\n' "$port" > "$tmp"
  cp "$UPSTREAM" "$UPSTREAM.prev" 2>/dev/null || true
  install -m 0644 "$tmp" "$UPSTREAM"; rm -f "$tmp"
  if ! caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >>"$LOG" 2>&1; then
    say "caddy config did not validate; restoring the previous upstream"
    cp "$UPSTREAM.prev" "$UPSTREAM"; return 1
  fi
  # `caddy validate` runs as root and opens the access log; keep the file Caddy's own.
  chown -R caddy:caddy /var/log/caddy 2>/dev/null || true
  systemctl reload caddy
  say "caddy now routes marque.trade to :$port"
}

healthy() {
  local port="$1" code
  for _ in $(seq 1 60); do
    code="$(curl -s -o /dev/null -w '%{http_code}' -m 5 "http://127.0.0.1:$port/api/health" || true)"
    [ "$code" = 200 ] && break; sleep 2
  done
  [ "$code" = 200 ] || { say "  :$port /api/health never answered 200"; return 1; }
  for u in / /register /quest /builders "/api/v1/marketplace?limit=3&offset=0" /api/v1/phase2/config; do
    code="$(curl -s -o /dev/null -w '%{http_code}' -m 90 "http://127.0.0.1:$port$u" || echo 000)"
    echo "  $code :$port$u" | tee -a "$LOG"
    [ "$code" = 200 ] || return 1
  done
}

start_slot() {
  local port="$1" name
  name="$(name_of "$port")"
  pm2 delete "$name" >/dev/null 2>&1 || true
  pm2 start "$ROOT/ecosystem.config.cjs" --only "$name" >/dev/null
  say "started $name on :$port -> $(readlink "$REL/slot-$port")"
}

retire_later() {
  # systemd runs the stop with a bare PATH, so pm2 is called by its absolute path
  # (the first retire, 27 Sep, failed with "pm2: command not found").
  local name="$1" unit="marque-retire-$1-$STAMP" pm2bin
  pm2bin="$(command -v pm2)"
  systemd-run --unit "$unit" --on-active="$RETIRE_AFTER" --setenv=HOME=/root --setenv=PM2_HOME=/root/.pm2 \
    --setenv=PATH="$(dirname "$pm2bin"):$(dirname "$(command -v node)"):/usr/bin:/bin" "$pm2bin" stop "$name" >/dev/null 2>&1 \
    && say "$name stops in ${RETIRE_AFTER}s (systemd unit $unit)" \
    || say "could not schedule the stop of $name; stop it by hand: pm2 stop $name"
}

if [ "${1:-}" = "--status" ]; then
  echo "live :$(live_port)"
  for p in 3200 3201; do echo "slot-$p -> $(readlink "$REL/slot-$p" 2>/dev/null || echo none)  $(pm2 jlist 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s).find(x=>x.name==='$(name_of $p)');console.log(a?a.pm2_env.status:'absent')})")"; done
  exit 0
fi

if [ "${1:-}" = "--rollback" ]; then
  LIVE="$(live_port)"; PREV="$(other "$LIVE")"
  [ -L "$REL/slot-$PREV" ] || { say "no previous slot to roll back to"; exit 1; }
  if ! curl -s -o /dev/null -m 3 "http://127.0.0.1:$PREV/api/health"; then start_slot "$PREV"; fi
  healthy "$PREV" || { say "previous slot is not healthy; not switching"; exit 1; }
  switch_to "$PREV"
  retire_later "$(name_of "$LIVE")"
  say "rolled back to $(readlink "$REL/slot-$PREV")"
  exit 0
fi

cd "$ROOT"
SHA="$(git rev-parse --short HEAD)"
LIVE="$(live_port)"; IDLE="$(other "$LIVE")"
say "commit $SHA; live :$LIVE, deploying to :$IDLE; log $LOG"

say "building (memory capped)"
systemd-run --user --scope -q -p MemoryMax=5G -p MemorySwapMax=3G \
  --setenv=MARQUE_BUILD_DIR=.next-verify nice -n 5 bash scripts/build-web.sh >>"$LOG" 2>&1

say "staging release $SHA"
rm -rf "$REL/$SHA.tmp"
cp -a "$WEB/.next-verify/standalone" "$REL/$SHA.tmp"
rm -rf "$REL/$SHA" && mv "$REL/$SHA.tmp" "$REL/$SHA"
ln -sfn "$REL/$SHA" "$REL/slot-$IDLE"

start_slot "$IDLE"
if ! healthy "$IDLE"; then
  say "candidate failed its health check; live :$LIVE untouched"
  pm2 stop "$(name_of "$IDLE")" >/dev/null 2>&1 || true
  exit 1
fi
if ! node scripts/verify-candidate.mjs "http://127.0.0.1:$IDLE" >>"$LOG" 2>&1; then
  say "candidate failed verify-candidate (see $LOG); live :$LIVE untouched"
  pm2 stop "$(name_of "$IDLE")" >/dev/null 2>&1 || true
  exit 1
fi

# Warm the new slot's projections right before it takes traffic (a cold home page
# recomputes the marketplace, coverage and ledger reads on first hit).
for u in / /register /register/yield /agents/keel /quest /builders /api/v1/phase2/coverage; do
  curl -s -o /dev/null -m 60 "http://127.0.0.1:$IDLE$u" || true
done

switch_to "$IDLE"

# Public smoke through Caddy. On failure, switch straight back: the old slot is still up.
fails=0
for u in / /register /quest /api/health "/api/v1/marketplace?limit=3&offset=0" /api/v1/phase2/config /api/v1/phase2/stats; do
  code="$(curl -s -o /dev/null -w '%{http_code}' -m 90 "$PUBLIC_URL$u" || echo 000)"
  echo "  $code $u" | tee -a "$LOG"; [ "$code" = 200 ] || fails=$((fails + 1))
done
if [ "$fails" -gt 0 ]; then
  say "public smoke failed ($fails); switching back to :$LIVE"
  switch_to "$LIVE"; exit 1
fi

retire_later "$(name_of "$LIVE")"
pm2 save >/dev/null 2>&1 || true

# Keep the two slot targets and the three newest other releases.
keep="$(readlink "$REL/slot-3200" 2>/dev/null || true) $(readlink "$REL/slot-3201" 2>/dev/null || true)"
ls -1dt "$REL"/*/ 2>/dev/null | sed 's:/$::' | grep -v '\.tmp$' | while read -r d; do
  case " $keep " in *" $d "*) continue ;; esac
  echo "$d"
done | tail -n +4 | xargs -r rm -rf

say "deployed $SHA on :$IDLE (rollback: bash scripts/deploy-web.sh --rollback)"
