#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   DATABASE_URL=postgresql://... ./scripts/db_backup.sh [/path/to/backup.dump]

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

OUT_PATH="${1:-}"
if [[ -z "$OUT_PATH" ]]; then
  TS="$(date +%Y%m%d-%H%M%S)"
  OUT_PATH="backups/schoolcatering-${TS}.dump"
fi

mkdir -p "$(dirname "$OUT_PATH")"
pg_dump --format=custom --no-owner --no-privileges --file="$OUT_PATH" "$DATABASE_URL"
echo "Backup written to: $OUT_PATH"
