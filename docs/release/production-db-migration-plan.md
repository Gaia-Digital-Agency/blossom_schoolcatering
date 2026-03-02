# Production DB Migration Plan

Prepared on: 2026-03-02  
Execution target: 2026-03-03

## Migration source of truth
Apply in this exact order:
1. `db/migrations/001_init_schema.sql`
2. `db/migrations/002_seed_reference_data.sql`
3. `db/migrations/003_views_and_reports.sql`
4. `db/migrations/004_auth_oauth_constraints.sql`
5. `db/migrations/005_auth_runtime_sessions.sql`

## Preconditions
- Production DB instance is created and reachable.
- Deployment user has create/alter privileges.
- Backup is taken immediately before running migrations.
- Maintenance window approved.

## Execution steps
1. Create pre-migration backup:
```bash
export DATABASE_URL='postgresql://<user>:<pass>@<host>:5432/<db>'
./scripts/db_backup.sh /var/backups/schoolcatering/pre-migration-$(date +%Y%m%d-%H%M%S).dump
```
2. Apply SQL files in order:
```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/001_init_schema.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/002_seed_reference_data.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/003_views_and_reports.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/004_auth_oauth_constraints.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/005_auth_runtime_sessions.sql
```
3. Validate schema and runtime essentials:
```bash
psql "$DATABASE_URL" -c "\dt"
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM users;"
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM schools;"
```
4. Run application smoke checks (`/health`, `/ready`, login, menu list, order flow).

## Failure handling
- Stop migration at first error.
- Keep DB read-only for investigation.
- Use rollback plan in `docs/release/rollback-plan.md` if needed.

## Evidence to capture
- Backup file path
- Console logs from each migration command
- Validation query outputs
- Sign-off timestamp and operator
