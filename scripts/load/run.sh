#!/usr/bin/env bash
# P2-11: run the read mix at 25, 50, 100 and 250 virtual users, one stage at a time, and
# record the box's CPU and memory and PM2 restarts during each stage.
#   bash scripts/load/run.sh [BASE] [OUT_DIR]
#   STAGES="25 50 100" HOLD=60s bash scripts/load/run.sh   (default: all four stages, 90 s each)
# A stage that trips the stop rule in read-mix.js (5xx over 0.5%, page p95 over 2 s) ends the whole run.
set -uo pipefail
BASE="${1:-https://marque.trade}"
OUT="${2:-/root/.marque/load/$(date -u +%Y%m%dT%H%M%SZ)}"
HOLD="${HOLD:-90s}"
mkdir -p "$OUT"
monitor_pids=()
cleanup() { if [ "${#monitor_pids[@]}" -gt 0 ]; then kill "${monitor_pids[@]}" 2>/dev/null || true; wait "${monitor_pids[@]}" 2>/dev/null || true; fi; monitor_pids=(); }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
[[ "$HOLD" =~ ^[1-9][0-9]*(ms|s|m)$ ]] || { echo 'HOLD must be a positive duration.' >&2; exit 2; }
for stage in ${STAGES:-25 50 100 250}; do
  [[ "$stage" =~ ^[1-9][0-9]*$ ]] && [ "$stage" -le 250 ] || { echo 'Stages must contain whole visitor counts from 1 to 250.' >&2; exit 2; }
  [ ! -e "$OUT/summary-$stage.json" ] && [ ! -e "$OUT/k6-$stage.txt" ] || { echo "Refusing to overwrite measurements for $stage visitors." >&2; exit 2; }
done
restarts() { pm2 jlist | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s).filter(p=>p.name.startsWith('marque-'));console.log(a.reduce((n,p)=>n+(p.pm2_env.restart_time||0),0))})"; }
for vus in ${STAGES:-25 50 100 250}; do
  echo "== $vus VUs"
  r0=$(restarts)
  vmstat 5 > "$OUT/vmstat-$vus.txt" & VM=$!
  ( while true; do free -m | awk '/Mem:/{print strftime("%H:%M:%S"), $3, $7}' >> "$OUT/mem-$vus.txt"; sleep 5; done ) & MEM=$!
  monitor_pids=("$VM" "$MEM")
  k6 run --quiet -e BASE="$BASE" -e VUS="$vus" -e HOLD="$HOLD" --summary-export "$OUT/summary-$vus.json" scripts/load/read-mix.js > "$OUT/k6-$vus.txt" 2>&1
  rc=$?
  cleanup
  r1=$(restarts)
  echo "$vus $r0 $r1" >> "$OUT/restarts.txt"
  # k6 versions use different nonzero codes for threshold aborts (the installed version returned 69).
  # Every unsuccessful stage stops the whole run, including a missed target or an interrupted generator.
  if [ "$rc" -ne 0 ]; then
    echo "stopped at $vus VUs: k6 exited $rc; no higher stage was started" | tee -a "$OUT/restarts.txt"
    exit "$rc"
  fi
  sleep 20
done
echo "$OUT"
