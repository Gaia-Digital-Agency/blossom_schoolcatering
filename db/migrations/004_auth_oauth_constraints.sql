BEGIN;

-- ============================================================
-- AUTH PROVIDER ENUM (for social identity mapping)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'auth_provider_type') THEN
    CREATE TYPE auth_provider_type AS ENUM ('LOCAL', 'GOOGLE');
  END IF;
END$$;

-- ============================================================
-- USERS: case-insensitive unique email (nullable)
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS users_email_ci_uq
  ON users (lower(email))
  WHERE email IS NOT NULL;

-- ============================================================
-- USER IDENTITIES: external OAuth identities
-- ============================================================
CREATE TABLE IF NOT EXISTS user_identities (
  id               uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid               NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider         auth_provider_type NOT NULL,
  provider_user_id varchar(255)       NOT NULL,
  provider_email   varchar(255),
  created_at       timestamptz        NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_user_id),
  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS user_identities_provider_email_idx
  ON user_identities (provider, lower(provider_email));

-- ============================================================
-- FUNCTION: deterministic unique username generation
-- base, base-1, base-2, ...
-- ============================================================
CREATE OR REPLACE FUNCTION generate_unique_username(base_username text)
RETURNS text AS $$
DECLARE
  candidate text;
  i integer := 0;
BEGIN
  IF base_username IS NULL OR length(trim(base_username)) = 0 THEN
    RAISE EXCEPTION 'base_username cannot be empty';
  END IF;

  candidate := lower(trim(base_username));
  WHILE EXISTS (SELECT 1 FROM users WHERE username = candidate) LOOP
    i := i + 1;
    candidate := lower(trim(base_username)) || '-' || i::text;
  END LOOP;

  RETURN candidate;
END;
$$ LANGUAGE plpgsql;

COMMIT;
