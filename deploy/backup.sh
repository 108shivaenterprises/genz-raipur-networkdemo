#!/usr/bin/env bash
# Daily encrypted-at-rest-friendly dump. Cron:  0 2 * * * /opt/genz/deploy/backup.sh
# Copy ./backups off the server too (e.g. rclone to Google Drive / S3 Mumbai).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p backups
STAMP=$(date +%Y%m%d-%H%M%S)
docker compose exec -T db pg_dump -U genz -d genz --no-owner | gzip > "backups/genz-$STAMP.sql.gz"
# v26 — the files that live on disk, not in Postgres: ID copies, owner-consent forms, protected-document pages.
# The KYC vault key file is NOT put in the same backup (a backup holding both the ciphertext and its key protects nothing) —
# keep KYC_VAULT_KEY in your password manager instead.
docker compose exec -T app tar czf - -C /app --exclude='data/.kyc-vault.key' data > "backups/files-$STAMP.tar.gz"
find backups -name 'genz-*.sql.gz' -mtime +30 -delete
find backups -name 'files-*.tar.gz' -mtime +30 -delete
echo "backup ok: backups/genz-$STAMP.sql.gz + backups/files-$STAMP.tar.gz"
