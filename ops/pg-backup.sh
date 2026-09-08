#!/usr/bin/env bash
# Nightly Postgres backup (P11 item 3).
#
# Dumps the marque database, gzips it, writes it to a SECOND location on disk,
# rotates to 7 days, and — if MARQUE_BACKUP_REMOTE is set (an rclone remote:path)
# — pushes it offsite. A single-disk VPS has no true offsite by itself; that
# env var is the hook, and RUNBOOK.md says what to point it at.
set -euo pipefail

set -a; . /root/.marque/secrets.env; set +a

PRIMARY="/root/marque-backups"
SECONDARY="/var/backups/marque"
KEEP_DAYS=7
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
NAME="marque-${STAMP}.sql.gz"

mkdir -p "$PRIMARY" "$SECONDARY"

# --- dump (custom format would be smaller, but plain SQL is trivially inspectable
#     and restores with psql on any box; the restore test relies on that).
pg_dump "$DATABASE_URL" --no-owner --no-privileges \
  | gzip -9 > "${PRIMARY}/${NAME}.partial"
mv "${PRIMARY}/${NAME}.partial" "${PRIMARY}/${NAME}"
cp "${PRIMARY}/${NAME}" "${SECONDARY}/${NAME}"

SIZE="$(du -h "${PRIMARY}/${NAME}" | cut -f1)"
echo "$(date -u +%FT%TZ) backup ${NAME} (${SIZE}) -> ${PRIMARY}, ${SECONDARY}"

# --- offsite, if configured
if [ -n "${MARQUE_BACKUP_REMOTE:-}" ] && command -v rclone >/dev/null 2>&1; then
  rclone copy "${PRIMARY}/${NAME}" "${MARQUE_BACKUP_REMOTE}" \
    && echo "$(date -u +%FT%TZ) offsite -> ${MARQUE_BACKUP_REMOTE}/${NAME}"
fi

# --- rotate
find "$PRIMARY"   -name 'marque-*.sql.gz' -mtime +${KEEP_DAYS} -delete
find "$SECONDARY" -name 'marque-*.sql.gz' -mtime +${KEEP_DAYS} -delete

# --- record the latest for the health monitor / status page to read
echo "${STAMP}" > "${PRIMARY}/LATEST"
