# Encrypted Google Drive backups

The backup pipeline uses pg_dump, gzip, age public-key encryption and rclone.
The initial 27 September archive was uploaded privately through the Drive connector,
downloaded, hash-checked, decrypted and restored successfully into a scratch database.
This verifies that archive, not recurring uploads. OAuth and an independent recovery-key
copy remain outstanding; nightly offsite automation is not yet enabled.
No database password is passed in pg_dump's command-line arguments.
The normal local backup uses restrictive creation permissions and a lock.

## Private configuration

- /root/.marque/backup.env: public encryption recipient and optional MARQUE_BACKUP_REMOTE.
- /root/.marque/rclone.conf: OAuth credentials, mode 600.
- /root/.marque/backup-recovery.key: private age identity, mode 600. Never commit or paste it.
- /root/marque-backups/OFFSITE_LATEST is updated by automation only after an upload and rclone checksum verification. The initial connector archive marker was set after download and hash verification.
- Local LATEST records local success independently. A configured remote failure exits nonzero.

The operator must copy the recovery key to an independent password manager or
secure offline device. A backup is not disaster-recoverable if its only key is on
the lost VPS. Do not put the unencrypted key next to the encrypted dump on Drive.

## Authorization

Run node ops/drive-connect.mjs. It prints only a loopback browser link, never a token.
Forward port 53682 over SSH and approve Drive access in your browser. The requested
drive.file scope accesses files created by that rclone application, not all existing
Drive files. The connector's one-off backup folder is separate from rclone's scope.

Rclone's upstream documentation warns that its shared OAuth client is being retired
during 2026. A dedicated Google OAuth client may be required for reliable recurring
use. Do not claim automation is enabled until authorization, an upload, checksum
verification and a restore from the downloaded ciphertext have succeeded.

## Restore

For a split initial archive, concatenate part-00, part-01 and part-02 in that order
into a .sql.gz.age file, then run:

    age --decrypt --identity /secure/path/backup-recovery.key backup.sql.gz.age | gzip -dc | psql --dbname=marque_restore_scratch

Use a fresh scratch database first. Never overwrite production as a verification step.
Compare required first-party table counts and run application smoke checks before
planning any actual recovery. The existing ops/pg-restore-test.sh implements a
local scratch restore drill; it does not by itself prove an offsite restore.

## Retention

Local SQL dumps retain the existing seven-day policy. This refresh does not
automatically delete remote objects. Monitor Drive storage and agree an offsite
retention policy before enabling remote deletion.

References: https://rclone.org/drive/ and https://rclone.org/crypt/
