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
# A response is healthy only when curl consumed the complete body successfully.
. "$ROOT/ops/http-health.sh"
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
  sed "s/{args\\[0\\]}/$port/g" "$ROOT/ops/web-upstream.caddy" > "$tmp"
  cp "$UPSTREAM" "$UPSTREAM.prev" 2>/dev/null || true
  install -m 0644 "$tmp" "$UPSTREAM"; rm -f "$tmp"
  if ! caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >>"$LOG" 2>&1; then
    say "caddy config did not validate; restoring the previous upstream"
    cp "$UPSTREAM.prev" "$UPSTREAM"; return 1
  fi
  # Existing logs retain their ownership; do not recursively modify shared product logs.
  if ! systemctl reload caddy; then
    say "caddy reload failed; restoring the previous upstream"
    cp "$UPSTREAM.prev" "$UPSTREAM"
    systemctl reload caddy >>"$LOG" 2>&1 || true
    return 1
  fi
  say "caddy now routes marque.trade to :$port"
}

healthy() {
  local port="$1" code
  for _ in $(seq 1 60); do
    code="$(http_health "http://127.0.0.1:$port/api/health" 5)"
    [ "$code" = "200 0" ] && break; sleep 2
  done
  [ "$code" = "200 0" ] || { say "  :$port /api/health never answered 200"; return 1; }
  for u in / /register /quest /builders "/api/v1/marketplace?limit=3&offset=0" /api/v1/phase2/config; do
    code="$(http_health "http://127.0.0.1:$port$u" 90)"
    echo "  $code :$port$u" | tee -a "$LOG"
    [ "$code" = "200 0" ] || return 1
  done
}

start_slot() {
  local port="$1" name
  name="$(name_of "$port")"
  pm2 delete "$name" >/dev/null 2>&1 || true
  MARQUE_RELEASE_SHA="$(cat "$REL/slot-$port/RELEASE_SHA" 2>/dev/null || true)" pm2 start "$ROOT/ecosystem.config.cjs" --only "$name" >/dev/null
  say "started $name on :$port -> $(readlink "$REL/slot-$port")"
}

# Save while both slots are available, before the proxy can depend on the new one.
# A reboot must never restore a stopped live slot from an older PM2 snapshot.
persist_processes() {
  if ! pm2 save >>"$LOG" 2>&1; then
    say "could not persist PM2 state; refusing to switch traffic"
    return 1
  fi
}

retire_later() {
  # systemd runs the stop with a bare PATH, so pm2 is called by its absolute path
  # (the first retire, 27 Sep, failed with "pm2: command not found").
  local name="$1" unit="marque-retire-$1-$STAMP" pm2bin
  pm2bin="$(command -v pm2)"
  systemd-run --unit "$unit" --on-active="$RETIRE_AFTER" --setenv=HOME=/root --setenv=PM2_HOME=/root/.pm2 \
    --setenv=PATH="$(dirname "$pm2bin"):$(dirname "$(command -v node)"):/usr/bin:/bin" /bin/bash -c '"$1" stop "$2" && "$1" save' _ "$pm2bin" "$name" >/dev/null 2>&1 \
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
  # The deploy that made LIVE live scheduled PREV's retirement: cancel it, or the slot
  # we are about to serve from would be stopped under traffic.
  for t in $(systemctl list-units --all --plain --no-legend "marque-retire-$(name_of "$PREV")-*.timer" | awk '{print $1}'); do
    systemctl stop "$t" && say "cancelled $t"
  done
  if [ "$(http_health "http://127.0.0.1:$PREV/api/health" 3)" != "200 0" ]; then start_slot "$PREV"; fi
  healthy "$PREV" || { say "previous slot is not healthy; not switching"; exit 1; }
  persist_processes
  switch_to "$PREV"
  retire_later "$(name_of "$LIVE")"
  say "rolled back to $(readlink "$REL/slot-$PREV")"
  exit 0
fi

cd "$ROOT"
SHA="$(git rev-parse --short HEAD)"
LIVE="$(live_port)"; IDLE="$(other "$LIVE")"
say "commit $SHA; live :$LIVE, deploying to :$IDLE; log $LOG"

# Reject source/build mismatches before a candidate process or upstream is touched.
git diff --quiet HEAD -- || { say "tracked source is dirty; commit and verify it first"; exit 1; }
STANDALONE_SOURCE="$WEB/.next-verify/standalone"
if [ "${1:-}" = "--prepared" ]; then
  [ "$#" = 2 ] || { say "usage: --prepared DIRECTORY"; exit 64; }
  PREPARED="$(realpath -- "$2")"
  [ -d "$PREPARED/standalone" ] && [ -s "$PREPARED/SHA256SUMS" ] || { say "prepared artifact is incomplete"; exit 1; }
  [ "$(cat "$PREPARED/RELEASE_SHA")" = "$(git rev-parse HEAD)" ] || { say "prepared release SHA does not match HEAD"; exit 1; }
  BUILD_SOURCE="$(cat "$PREPARED/BUILD_SOURCE_SHA")"
  [[ "$BUILD_SOURCE" =~ ^[a-f0-9]{40}$ ]] || { say "invalid build-source SHA"; exit 1; }
  # Worker, CI, deployment tooling and evidence-doc changes do not invalidate an
  # unchanged web component. Every web/package/config/dependency input must match.
  git diff --quiet "$BUILD_SOURCE" HEAD -- apps/web packages config docs/standard docs/pancakeswap-proof.json .npmrc pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json || { say "web inputs differ from the tested build"; exit 1; }
  (cd "$PREPARED" && sha256sum --strict --quiet -c SHA256SUMS) >>"$LOG" 2>&1 || { say "prepared artifact checksum failed"; exit 1; }
  STANDALONE_SOURCE="$PREPARED/standalone"
  say "using verified prepared web artifact from $BUILD_SOURCE"
else
  [ "$#" = 0 ] || { say "unknown deploy arguments"; exit 64; }
  BUILD_SOURCE="$(git rev-parse HEAD)"
  say "building (memory capped)"
  systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=1G -p CPUQuota=50% -p CPUWeight=1 \
    --setenv=MARQUE_BUILD_DIR=.next-verify nice -n 5 bash scripts/build-web.sh >>"$LOG" 2>&1
fi

say "staging release $SHA"
[ ! -e "$REL/$SHA" ] && [ ! -e "$REL/$SHA.tmp" ] || { say "release already exists; preserve it and use --rollback if appropriate"; exit 1; }
cp -a "$STANDALONE_SOURCE" "$REL/$SHA.tmp"
git rev-parse HEAD > "$REL/$SHA.tmp/RELEASE_SHA"
printf '%s\n' "$BUILD_SOURCE" > "$REL/$SHA.tmp/BUILD_SOURCE_SHA"
mv "$REL/$SHA.tmp" "$REL/$SHA"
ln -sfn "$REL/$SHA" "$REL/slot-$IDLE"

# A deploy within five minutes of the last one reuses the slot that deploy scheduled to
# retire; without this, the old timer stops the new candidate mid-check (2 Oct: two
# deploys failed that way, 3 s and 4 min after starting the candidate).
for t in $(systemctl list-units --all --plain --no-legend "marque-retire-$(name_of "$IDLE")-*.timer" | awk '{print $1}'); do
  systemctl stop "$t" && say "cancelled $t (its slot is the new candidate)"
done

start_slot "$IDLE"
if ! healthy "$IDLE"; then
  say "candidate failed its health check; live :$LIVE untouched"
  pm2 stop "$(name_of "$IDLE")" >/dev/null 2>&1 || true
  exit 1
fi
if ! EXPECTED_RELEASE_SHA="$(git rev-parse HEAD)" node scripts/verify-candidate.mjs "http://127.0.0.1:$IDLE" >>"$LOG" 2>&1; then
  say "candidate failed verify-candidate (see $LOG); live :$LIVE untouched"
  pm2 stop "$(name_of "$IDLE")" >/dev/null 2>&1 || true
  exit 1
fi

# Warm the new slot's projections right before it takes traffic (a cold home page
# recomputes the marketplace, coverage and ledger reads on first hit).
for u in / /register /register/yield /agents/keel /quest /builders /api/v1/phase2/coverage; do
  curl -s -o /dev/null -m 60 "http://127.0.0.1:$IDLE$u" || true
done

persist_processes
switch_to "$IDLE"

# Public smoke through Caddy. On failure, switch straight back: the old slot is still up.
fails=0
for u in / /register /quest /api/health "/api/v1/marketplace?limit=3&offset=0" /api/v1/phase2/config /api/v1/phase2/stats; do
  code="$(http_health "$PUBLIC_URL$u" 90)"
  echo "  $code $u" | tee -a "$LOG"; [ "$code" = "200 0" ] || fails=$((fails + 1))
done
if [ "$fails" -gt 0 ]; then
  say "public smoke failed ($fails); switching back to :$LIVE"
  switch_to "$LIVE"; exit 1
fi

retire_later "$(name_of "$LIVE")"

# Release pruning is a separate operator retention task; deployment never deletes releases.

say "deployed $SHA on :$IDLE (rollback: bash scripts/deploy-web.sh --rollback)"
