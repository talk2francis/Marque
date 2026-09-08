#!/usr/bin/env bash
# Load test (P11 item 9): 50 concurrent position reads for ARBITRARY addresses,
# hitting the same server path a visitor's Desk uses. Reports status spread,
# latency percentiles, and whether the site stayed up.
set -uo pipefail
BASE="${1:-https://marque.trade}"
N="${2:-50}"

# A spread of real-ish BSC addresses so every read does distinct chain work.
ADDRS=(
  0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf
  0x2e07E0145C0CFdF6D200B0aFAeD36953ef00d0cD
  0x8894E0a0c962CB723c1976a4421c95949bE2D4E3
  0x0eD7e52944161450477ee417DE9Cd3a859b14fD0
  0x1234567890123456789012345678901234567890
  0xf977814e90da44bfa03b6295a0616a897441acec
  0x8894e0a0c962cb723c1976a4421c95949be2d4e3
  0x28C6c06298d514Db089934071355E5743bf21d60
  0x21a31Ee1afC51d94C2eFcCAa2092aD1028285549
  0x5a52E96BAcdaBb82fd05763E25335261B270Efcb
)

TMP="$(mktemp -d)"
echo "load: ${N} concurrent /api/v1/pancakeswap reads against ${BASE}"
START=$(date +%s.%N)
for i in $(seq 1 "$N"); do
  A="${ADDRS[$((RANDOM % ${#ADDRS[@]}))]}"
  ( curl -sS -o /dev/null -m 45 -w '%{http_code} %{time_total}\n' \
      "${BASE}/api/v1/pancakeswap/${A}" > "${TMP}/${i}" 2>&1 ) &
done
wait
END=$(date +%s.%N)

cat "${TMP}"/* | awk -v wall="$(echo "$END - $START" | bc)" '
  { codes[$1]++; t[NR]=$2; sum+=$2 }
  END {
    n=NR; asort(t)
    printf "\nrequests      %d\n", n
    printf "wall clock    %.2fs\n", wall
    printf "status        "; for (c in codes) printf "%s×%d  ", c, codes[c]; printf "\n"
    printf "latency  p50  %.2fs\n", t[int(n*0.50)]
    printf "         p90  %.2fs\n", t[int(n*0.90)]
    printf "         p99  %.2fs\n", t[(n>1)?int(n*0.99):1]
    printf "         max  %.2fs\n", t[n]
    ok = codes["200"] + 0
    printf "\n%s  %d/%d returned 200\n", (ok==n ? "PASS —" : "CHECK —"), ok, n
  }'
rm -rf "${TMP}"
# and confirm the site itself is still healthy right after
echo -n "post-load homepage: "; curl -sS -o /dev/null -m 15 -w '%{http_code}\n' "${BASE}/"
