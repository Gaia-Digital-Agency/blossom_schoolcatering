# Production DB Runbook

Use this for new production servers.

## Prerequisite

1. `DATABASE_URL` points to target production database.
2. Use `psql` client.

## Fresh install sequence (new servers)

1. Baseline schema/features:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/db/100_baseline_schema_v2.sql
```

2. Reporting views:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/db/003_views_and_reports.sql
```

3. Runtime auth sessions:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/db/005_auth_runtime_sessions.sql
```

4. Performance indexes:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/db/101_perf_indexes.sql
```

## Optional production data steps

1. School seed snapshot (future-use):

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/db/102_seed_schools_from_current_data.sql
```

2. Delivery and delivery-to-school assignment seed (future-use):

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/db/103_seed_delivery_from_current_data.sql
```

3. Menu seed snapshot (future-use):

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/db/104_seed_menu_from_current_data.sql
```

4. Parent + youngster registration seed (future-use):

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/db/105_seed_parent_youngster_from_current_data.sql
```

5. Pre-go-live cleanup helpers (run only when needed):

Delete historical transactional seed rows before 2025-03-09:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/cleanup_seed_data_before_2025_03_09.sql
```

Delete named seed parent groups and associated youngster/orders/billing/delivery:

```bash
DATABASE_URL="$DATABASE_URL" bash scripts/cleanup_named_seed_parents_preprod.sh
```

## Existing environments

For environments already using `001` to `013`, keep that history immutable.
Do not rewrite or renumber old migrations.
