#!/usr/bin/env bash
# Restore-test the latest backup (P11 item 3: "TEST THE RESTORE").
#
# Restores the newest dump into a throwaway database (created via the local
# postgres superuser over peer auth), checks that the tables that matter come
# back non-empty, prints a row-count comparison against production, and drops
# the scratch database. It NEVER touches production.
set -euo pipefail

set -a; . /root/.marque/secrets.env; set +a

PRIMARY="/root/marque-backups"
LATEST="$(ls -1t ${PRIMARY}/marque-*.sql.gz 2>/dev/null | head -1 || true)"
[ -n "$LATEST" ] || { echo "no backup found in ${PRIMARY}"; exit 1; }

SCRATCH="marque_restore_test_$(date -u +%s)"
PGADMIN="sudo -u postgres psql"

echo "restoring $(basename "$LATEST") into ${SCRATCH} ..."
$PGADMIN -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${SCRATCH} OWNER marque;" >/dev/null
trap '$PGADMIN -c "DROP DATABASE IF EXISTS ${SCRATCH} WITH (FORCE);" >/dev/null 2>&1 || true' EXIT

gunzip -c "$LATEST" | sudo -u postgres psql -v ON_ERROR_STOP=1 -q -d "${SCRATCH}" >/dev/null

echo
printf '%-24s %12s %12s\n' "table" "production" "restored"
FAIL=0
for T in agent agent_service agent_category probe conformance_result conformance_case \
         funnel_snapshot builder_listing charter run receipt benchmark benchmark_run \
         pool_tick_observation sealed_call product_event; do
  P=$(psql "$DATABASE_URL" -tAc "select count(*) from ${T}" 2>/dev/null || echo ERR)
  R=$(sudo -u postgres psql -tAc "select count(*) from ${T}" -d "${SCRATCH}" 2>/dev/null || echo ERR)
  printf '%-24s %12s %12s\n' "$T" "$P" "$R"
  case "$T" in
    probe|conformance_result|receipt|sealed_call|pool_tick_observation|benchmark_run)
      if [ "$P" != "0" ] && [ "$P" != "ERR" ] && { [ "$R" = "0" ] || [ "$R" = "ERR" ]; }; then
        echo "  !! first-party table ${T} restored empty"; FAIL=1
      fi ;;
  esac
done

echo
if [ "$FAIL" = "0" ]; then echo "RESTORE TEST: PASS  ($(basename "$LATEST"))"; else echo "RESTORE TEST: FAIL"; exit 1; fi
