#!/usr/bin/env bash
# P2-11: run the read mix at 25, 50, 100 and 250 virtual users, one stage at a time, and
# record the box's CPU and memory and PM2 restarts during each stage.
#   bash scripts/load/run.sh [BASE] [OUT_DIR]
set -uo pipefail
BASE="${1:-https://marque.trade}"
OUT="${2:-/root/.marque/load/$(date -u +%Y%m%dT%H%M%SZ)}"
HOLD="${HOLD:-90s}"
mkdir -p "$OUT"
restarts() { pm2 jlist | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s).filter(p=>p.name.startsWith('marque-'));console.log(a.reduce((n,p)=>n+(p.pm2_env.restart_time||0),0))})"; }
for vus in 25 50 100 250; do
  echo "== $vus VUs"
  r0=$(restarts)
  vmstat 5 > "$OUT/vmstat-$vus.txt" & VM=$!
  ( while true; do free -m | awk '/Mem:/{print strftime("%H:%M:%S"), $3, $7}' >> "$OUT/mem-$vus.txt"; sleep 5; done ) & MEM=$!
  k6 run --quiet -e BASE="$BASE" -e VUS="$vus" -e HOLD="$HOLD" --summary-export "$OUT/summary-$vus.json" scripts/load/read-mix.js > "$OUT/k6-$vus.txt" 2>&1
  kill $VM $MEM 2>/dev/null
  r1=$(restarts)
  echo "$vus $r0 $r1" >> "$OUT/restarts.txt"
  sleep 20
done
echo "$OUT"
