# Rollback Plan (App + DB)

Prepared on: 2026-03-02

## Trigger Conditions
Execute rollback if any of the following occur after deployment:
- `/ready` remains `not_ready` for more than 10 minutes
- critical auth/order/billing flow fails for all users
- severe data integrity issue detected
- sustained elevated error rate (5xx) beyond agreed threshold

## App Rollback
1. Identify previous known-good git tag/commit.
2. On production host:
```bash
cd /var/www/schoolcatering
git fetch --all --tags
git checkout <known-good-tag-or-commit>
npm run build:api
npm run build:web
pm2 restart schoolcatering-api
pm2 restart schoolcatering-web
```
3. Validate:
```bash
curl -fsS http://127.0.0.1:3006/health
curl -fsS http://127.0.0.1:3006/ready
```

## DB Rollback
Use only when migration or data changes caused production breakage.

1. Put app in maintenance mode.
2. Restore last pre-deploy backup (from `scripts/db_backup.sh` output):
```bash
export DATABASE_URL='postgresql://<user>:<pass>@<host>:5432/postgres'
export BACKUP_FILE='/var/backups/schoolcatering/pre-migration-<timestamp>.dump'

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS schoolcatering_db;"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE schoolcatering_db;"
pg_restore --clean --if-exists --no-owner --no-privileges --dbname='postgresql://<user>:<pass>@<host>:5432/schoolcatering_db' "$BACKUP_FILE"
```
3. Restart app services and verify health.

## Communication Protocol
- Notify Product, Ops, QA immediately when rollback starts.
- Provide reason, expected duration, and next update time.
- After rollback complete, send incident summary and next actions.

## Post-Rollback Actions
- Freeze further deploys.
- Capture logs and root-cause evidence.
- Create follow-up fix plan and retest in staging before next production attempt.
