#!/usr/bin/env bash
# Nightly Postgres backup (P11 item 3).
#
# Dumps the marque database, gzips it, writes it to a SECOND location on disk,
# rotates to 7 days, and — if MARQUE_BACKUP_REMOTE is set (an rclone remote:path)
# — pushes it offsite. A single-disk VPS has no true offsite by itself; that
# env var is the hook, and RUNBOOK.md says what to point it at.
set -euo pipefail
umask 077
exec 9>/root/.marque/backup.lock
flock -n 9 || { echo "A backup is already running"; exit 1; }

set -a; . /root/.marque/secrets.env; set +a
if [ -f /root/.marque/backup.env ]; then
  set -a; . /root/.marque/backup.env; set +a
fi

PRIMARY="/root/marque-backups"
SECONDARY="/var/backups/marque"
KEEP_DAYS=7
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
NAME="marque-${STAMP}.sql.gz"

mkdir -p "$PRIMARY" "$SECONDARY"

# --- dump (custom format would be smaller, but plain SQL is trivially inspectable
#     and restores with psql on any box; the restore test relies on that).
node /root/marque/ops/pg-command.mjs pg_dump --no-owner --no-privileges \
  | gzip -9 > "${PRIMARY}/${NAME}.partial"
mv "${PRIMARY}/${NAME}.partial" "${PRIMARY}/${NAME}"
cp "${PRIMARY}/${NAME}" "${SECONDARY}/${NAME}"

SIZE="$(du -h "${PRIMARY}/${NAME}" | cut -f1)"
echo "$(date -u +%FT%TZ) backup ${NAME} (${SIZE}) -> ${PRIMARY}, ${SECONDARY}"

# Record local success independently of the offsite result.
echo "${STAMP}" > "${PRIMARY}/LATEST"

# Offsite copies are always encrypted. Never silently skip a configured remote.
if [ -n "${MARQUE_BACKUP_REMOTE:-}" ]; then
  command -v rclone >/dev/null
  command -v age >/dev/null
  : "${MARQUE_BACKUP_RECIPIENT:?Set the age public recipient in backup.env}"
  age -r "$MARQUE_BACKUP_RECIPIENT" -o "${PRIMARY}/${NAME}.age.partial" "${PRIMARY}/${NAME}"
  mv "${PRIMARY}/${NAME}.age.partial" "${PRIMARY}/${NAME}.age"
  rclone --config /root/.marque/rclone.conf copyto "${PRIMARY}/${NAME}.age" "${MARQUE_BACKUP_REMOTE}/${NAME}.age"
  rclone --config /root/.marque/rclone.conf check "${PRIMARY}" "${MARQUE_BACKUP_REMOTE}" --include "/${NAME}.age" --one-way
  echo "${STAMP}" > "${PRIMARY}/OFFSITE_LATEST"
  echo "$(date -u +%FT%TZ) encrypted offsite copy verified"
else
  echo "$(date -u +%FT%TZ) WARNING: offsite backup is not configured" >&2
fi

# --- rotate
find "$PRIMARY"   -name 'marque-*.sql.gz' -mtime +${KEEP_DAYS} -delete
# The encrypted copies made for the offsite upload rotate locally too (the Drive copies stay).
find "$PRIMARY"   -name 'marque-*.sql.gz.age' -mtime +${KEEP_DAYS} -delete
find "$SECONDARY" -name 'marque-*.sql.gz' -mtime +${KEEP_DAYS} -delete

# --- record the latest for the health monitor / status page to read
echo "${STAMP}" > "${PRIMARY}/LATEST"
