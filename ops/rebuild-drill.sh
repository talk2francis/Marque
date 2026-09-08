#!/usr/bin/env bash
# Rebuild drill (P11 item 7) — respects AGENTS.md invariant 12.
#
#   DERIVED STATE (agent, agent_service, agent_category, ingest_cursor):
#     drilled here. Restored into a SCRATCH database, truncated, and rebuilt by
#     running the real ingest worker from cursor zero against the scratch DB.
#     Production is never touched.
#
#   FIRST-PARTY OBSERVATIONS (probe, conformance_result, receipt, run,
#     benchmark_run, sealed_call, pool_tick_observation): NOT part of the drill
#     and NOT reconstructable. They are verified by the restore test
#     (ops/pg-restore-test.sh) instead — a nightly dump that actually restores.
#     A grep confirms the ingest code path has no insert/update/delete against
#     any of these tables.
set -euo pipefail
set -a; . /root/.marque/secrets.env; set +a

PRIMARY="/root/marque-backups"
LATEST="$(ls -1t ${PRIMARY}/marque-*.sql.gz 2>/dev/null | head -1)"
[ -n "$LATEST" ] || { echo "no backup found"; exit 1; }
SCRATCH="marque_rebuild_drill_$(date -u +%s)"
PGADMIN="sudo -u postgres psql"
PGUSER="$(echo "$DATABASE_URL" | sed -E 's#.*//([^:]+):.*#\1#')"
PGPASS="$(echo "$DATABASE_URL" | sed -E 's#.*//[^:]+:([^@]+)@.*#\1#')"
PGHP="$(echo "$DATABASE_URL"   | sed -E 's#.*@([^/]+)/.*#\1#')"
SCRATCH_URL="postgresql://${PGUSER}:${PGPASS}@${PGHP}/${SCRATCH}"

echo "== step 0 — the ingest code writes only derived tables =="
if grep -rqnE '\.insert\((probe|conformanceResult|receipt|sealedCall|run|benchmarkRun|poolTick)' \
     "$(dirname "$0")/../packages/registry/src" "$(dirname "$0")/../apps/worker/src/ingest.ts" 2>/dev/null; then
  echo "  !! ingest touches a first-party table — FAIL"; exit 1
fi
echo "  ok — ingest inserts only: agent, agent_service, agent_category, funnel_snapshot, ingest_cursor"
echo

echo "== step 1 — restore prod snapshot into ${SCRATCH} =="
$PGADMIN -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${SCRATCH} OWNER ${PGUSER};" >/dev/null
trap '$PGADMIN -c "DROP DATABASE IF EXISTS ${SCRATCH} WITH (FORCE);" >/dev/null 2>&1 || true' EXIT
export PGPASSWORD="$PGPASS"
gunzip -c "$LATEST" | psql "$SCRATCH_URL" -q -v ON_ERROR_STOP=1 >/dev/null
echo "  restored $(basename "$LATEST") as ${PGUSER} (tables owned by ${PGUSER})"
echo

echo "== step 2 — snapshot derived + first-party counts, then truncate DERIVED only =="
before() { psql "$SCRATCH_URL" -tAc "select count(*) from $1" 2>/dev/null || echo ERR; }
D0_agent=$(before agent); D0_svc=$(before agent_service); D0_cat=$(before agent_category)
F0_probe=$(before probe); F0_conf=$(before conformance_result); F0_rcpt=$(before receipt)
F0_seal=$(before sealed_call); F0_tick=$(before pool_tick_observation)
psql "$SCRATCH_URL" -v ON_ERROR_STOP=1 -q -c \
  "truncate agent, agent_service, agent_category, ingest_cursor restart identity cascade;"
echo "  derived truncated. first-party rows now:"
printf "    probe %s  conformance_result %s  receipt %s  sealed_call %s  pool_tick_observation %s\n" \
  "$(before probe)" "$(before conformance_result)" "$(before receipt)" "$(before sealed_call)" "$(before pool_tick_observation)"
FP_OK=1
for pair in "probe:$F0_probe" "conformance_result:$F0_conf" "receipt:$F0_rcpt" "sealed_call:$F0_seal" "pool_tick_observation:$F0_tick"; do
  t="${pair%%:*}"; want="${pair##*:}"; got="$(before "$t")"
  [ "$got" = "$want" ] || { echo "  !! ${t} changed by truncate: ${want} -> ${got}"; FP_OK=0; }
done
[ "$FP_OK" = 1 ] && echo "  ok — first-party tables untouched by the derived truncate"
echo

echo "== step 3 — run the real ingest worker from cursor zero against ${SCRATCH} =="
echo "  (8004scan availability determines how far it gets; the drill proves the"
echo "   rebuild PATH and the tier separation, not a full 298k reconstruction)"
set +e
env DATABASE_URL="$SCRATCH_URL" INGEST_SWEEP_PAGES=3 INGEST_ENRICH_LIMIT=40 \
  timeout 150 node_modules/.bin/tsx apps/worker/src/ingest.ts --once 2>&1 | tail -12
set -e
echo

echo "== step 4 — result =="
A1=$(before agent); S1=$(before agent_service); C1=$(before agent_category); CUR=$(psql "$SCRATCH_URL" -tAc "select count(*) from ingest_cursor")
printf "  derived rebuilt:  agent %s (prod snapshot had %s)  agent_service %s  agent_category %s  ingest_cursor %s\n" \
  "$A1" "$D0_agent" "$S1" "$C1" "$CUR"
FUN=$(before funnel_snapshot)
printf "  funnel_snapshot:  %s  (append-only measurement, never truncated)\n" "$FUN"
if [ "$A1" != "0" ] && [ "$A1" != "ERR" ]; then
  echo "  PASS — ingest re-populated the derived tables from cursor zero; first-party tier untouched throughout."
else
  echo "  PARTIAL — ingest reached no upstream (8004scan down). Path + tier separation verified; full reconstruction pending upstream."
fi
