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

## Notes
- This file stores DB access details for project setup continuity.
- Keep this file private and do not expose outside trusted team channels.
