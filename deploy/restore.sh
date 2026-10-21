#!/usr/bin/env bash
# Restore a dump:  ./deploy/restore.sh backups/genz-YYYYMMDD-HHMMSS.sql.gz   (stop the app first: docker compose stop app)
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f "${1:-}" ] || { echo "usage: $0 <dump.sql.gz>"; exit 1; }
docker compose exec -T db psql -U genz -d postgres -c "DROP DATABASE IF EXISTS genz" -c "CREATE DATABASE genz OWNER genz"
gunzip -c "$1" | docker compose exec -T db psql -U genz -d genz
# v26 — files: ./deploy/restore.sh <dump.sql.gz> <files.tar.gz>
if [ -f "${2:-}" ]; then docker compose run --rm -T --entrypoint sh app -c "tar xzf - -C /app" < "$2"; echo "files restored"; fi
echo "restore ok — start the app: docker compose start app"
