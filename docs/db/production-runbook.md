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

1. Reference/demo data (normally skip in production):

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/db/002_seed_reference_data.sql
```

2. Clone current active menu into a future date (recommended operational seed):

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/db/006_runtime_manual_test_seed.sql
```

3. UAT bulk data (do not run on production):

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/db/007_runtime_manual_data_seed.sql
```

4. Pre-go-live cleanup helpers (run only when needed):

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
