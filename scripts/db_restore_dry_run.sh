#!/usr/bin/env bash
set -euo pipefail

# Default mode is dry-run validation:
#   ./scripts/db_restore_dry_run.sh /path/to/backup.dump
#
# Full restore test mode (optional):
#   DATABASE_URL=postgresql://... RUN_RESTORE=1 ./scripts/db_restore_dry_run.sh /path/to/backup.dump

BACKUP_FILE="${1:-}"
if [[ -z "$BACKUP_FILE" || ! -f "$BACKUP_FILE" ]]; then
  echo "Backup file is required and must exist" >&2
  exit 1
fi

echo "[DRY-RUN] Reading archive metadata..."
pg_restore --list "$BACKUP_FILE" >/dev/null
echo "[DRY-RUN] OK: pg_restore can parse archive"

if [[ "${RUN_RESTORE:-0}" != "1" ]]; then
  echo "[DRY-RUN] Skipping actual restore (set RUN_RESTORE=1 to execute)"
  exit 0
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required when RUN_RESTORE=1" >&2
  exit 1
fi

RESTORE_DB="schoolcatering_restore_dry_run_$(date +%s)"
echo "[RESTORE] Creating temporary database: $RESTORE_DB"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${RESTORE_DB};" >/dev/null

cleanup() {
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${RESTORE_DB};" >/dev/null || true
}
trap cleanup EXIT

BASE_URL="$(echo "$DATABASE_URL" | sed -E 's#/(.+)$##')"
RESTORE_URL="${BASE_URL}/${RESTORE_DB}"

echo "[RESTORE] Restoring into temporary database..."
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$RESTORE_URL" "$BACKUP_FILE" >/dev/null
echo "[RESTORE] Success"
