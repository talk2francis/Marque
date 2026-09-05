#!/usr/bin/env bash
# Register all five reference agents as ERC-8004 identities on BSC TESTNET (97).
#
# BLOCKED as of 2026-09-05 by an 8004scan outage: their API answers
# {"code":"DATABASE_ERROR"} with 500 on a plain authenticated read, and
# `bag erc8004 register` brokers the registration through it, so there is no
# way around it from here. The wallets are funded and everything else is ready;
# this script is the whole remaining step. Re-run it when they are back.
#
# Check first:
#   curl -sS -H "X-API-Key: $SCAN_API_KEY" \
#     "https://api.8004scan.io/api/v1/agents?chain_id=56&limit=1" -o /dev/null -w '%{http_code}\n'
set -uo pipefail
cd "$(dirname "$0")/.."
set -a; . /root/.marque/secrets.env; set +a

register() {
  local id="$1" name="$2" desc="$3"
  echo "── $id"
  ( cd "agents/$id" && bag erc8004 register \
      --network bsc-testnet \
      --name "$name" \
      --description "$desc" \
      --endpoint "https://marque.trade/agents/$id" \
      --protocol A2A ) || echo "   FAILED — $id not registered"
}

register bound      "Bound"      "Marque reference agent: PancakeSwap V3 range health and bounded re-centre planning."
register lattice    "Lattice"    "Marque reference agent: constrained grid plans with fee-drag disclosed."
register sluicegate "Sluicegate" "Marque reference agent: net-APR-at-size yield routing across BNB Chain venues."
register keel       "Keel"       "Marque reference agent: Venus health factor, liquidation price and exact restore amount."
register redcell    "Redcell"    "Marque reference agent: BNB Chain approval and privileged-function risk triage."

echo
echo "Verify:  cd agents/<id> && bag erc8004 show"
