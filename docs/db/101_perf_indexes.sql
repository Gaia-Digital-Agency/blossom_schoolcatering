-- Consolidated performance indexes for fresh installs or index refresh.
--
-- Requires running with psql (uses \i include commands).
-- Example:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/db/101_perf_indexes.sql

\echo [101] Applying performance indexes: 012
\i docs/db/012_perf_missing_indexes.sql

\echo [101] Applying performance indexes: 013
\i docs/db/013_perf_parent_billing_indexes.sql

\echo [101] Performance indexes complete
