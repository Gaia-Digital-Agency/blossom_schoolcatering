# DB Backup and Restore Runbook

Date: 2026-03-02
Database: PostgreSQL (`schoolcatering_db`)

## Prerequisites
- `pg_dump`, `pg_restore`, `psql` installed on host.
- `DATABASE_URL` exported.

## 1) Create backup
```bash
export DATABASE_URL='postgresql://user:pass@127.0.0.1:5432/schoolcatering_db'
./scripts/db_backup.sh
```

Optional custom output path:
```bash
./scripts/db_backup.sh /var/backups/schoolcatering/latest.dump
```

## 2) Dry-run restore validation (no DB writes)
```bash
./scripts/db_restore_dry_run.sh /var/backups/schoolcatering/latest.dump
```

What this validates:
- backup archive is readable by `pg_restore`
- restore metadata is intact

## 3) Full restore test into temporary DB (safe dry run)
```bash
export DATABASE_URL='postgresql://user:pass@127.0.0.1:5432/postgres'
RUN_RESTORE=1 ./scripts/db_restore_dry_run.sh /var/backups/schoolcatering/latest.dump
```

Behavior:
- creates temporary DB
- restores backup into temporary DB
- drops temporary DB automatically

## 4) Disaster restore (manual production procedure)
1. Put app in maintenance mode.
2. Take final safety backup.
3. Restore backup to target DB.
4. Run app smoke tests (`/health`, `/ready`, auth login, core order/billing flow).
5. Exit maintenance mode.

## 5) Dry-run evidence template
- Date/time:
- Backup file path:
- `pg_restore --list` result: PASS/FAIL
- Temporary DB restore result (if executed): PASS/FAIL
- Reviewer:
