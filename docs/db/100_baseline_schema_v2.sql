-- Consolidated baseline for fresh installs only.
-- Keeps legacy history immutable by orchestrating existing migrations.
--
-- Requires running with psql (uses \i include commands).
-- Example:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/db/100_baseline_schema_v2.sql

\echo [100] Applying baseline: 001
\i docs/db/001_init_schema.sql

\echo [100] Applying auth/oauth compatibility: 004
\i docs/db/004_auth_oauth_constraints.sql

\echo [100] Applying hardened username function: 008
\i docs/db/008_fix_generate_unique_username.sql

\echo [100] Applying teacher registration fields: 009
\i docs/db/009_teacher_registration_actor.sql

\echo [100] Applying dish dietary flags: 010
\i docs/db/010_dish_dietary_flags.sql

\echo [100] Applying dish category requirement: 011
\i docs/db/011_dish_category_required.sql

\echo [100] Baseline complete
