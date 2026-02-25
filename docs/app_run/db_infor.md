# Database Information

## Current VM Database (Staging)
- Engine: PostgreSQL 16
- Host: `127.0.0.1`
- Port: `5432`
- Database: `schoolcatering_db`
- Username: `schoolcatering`
- Password: `PYQMr3MZkPwCYzcTMwwBODBE`
- Connection URL:
  - `postgresql://schoolcatering:PYQMr3MZkPwCYzcTMwwBODBE@127.0.0.1:5432/schoolcatering_db`

## Migrations
Applied migration files:
- `db/migrations/001_init_schema.sql`
- `db/migrations/002_seed_reference_data.sql`
- `db/migrations/003_views_and_reports.sql`
- `db/migrations/004_auth_oauth_constraints.sql`
- `db/migrations/005_auth_runtime_sessions.sql`

## Auth Runtime Notes
- API auth now uses DB-backed users and refresh sessions.
- `auth_refresh_sessions` table is active for refresh-token rotation.
- Default runtime role users are auto-seeded by API:
  - `admin` (ADMIN)
  - `kitchen` (KITCHEN)
  - `delivery` (DELIVERY)
  - `parent` (PARENT)
  - `youngster` (CHILD/YOUNGSTER app role)
- `teameditor` is revoked (`is_active = false`) by runtime bootstrap.

## Notes
- This file stores DB access details for project setup continuity.
- Keep this file private and do not expose outside trusted team channels.
