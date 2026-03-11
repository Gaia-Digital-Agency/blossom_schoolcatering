BEGIN;

-- Canonical delivery seed baseline (future use).
-- Replace-style behavior for delivery users and delivery-school assignments.
-- Backdoor password: teameditor123

CREATE TABLE IF NOT EXISTS delivery_school_assignments (
  delivery_user_id uuid NOT NULL REFERENCES users(id),
  school_id uuid NOT NULL REFERENCES schools(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (delivery_user_id, school_id)
);

CREATE INDEX IF NOT EXISTS idx_delivery_school_assignments_school
ON delivery_school_assignments(school_id, is_active);

DO $$
DECLARE
  v_password_hash text := crypt('teameditor123', gen_salt('bf'));
  v_delivery_user_id uuid;
  v_school_id uuid;
BEGIN
  SELECT id INTO v_school_id
  FROM schools
  WHERE lower(name) = lower('Blossom Primary Campus')
  LIMIT 1;

  IF v_school_id IS NULL THEN
    INSERT INTO schools (name, is_active)
    VALUES ('Blossom Primary Campus', true)
    RETURNING id INTO v_school_id;
  END IF;

  INSERT INTO users (
    role,
    username,
    password_hash,
    first_name,
    last_name,
    phone_number,
    email,
    is_active
  )
  VALUES (
    'DELIVERY',
    'delivery_dewa_putra',
    v_password_hash,
    'Dewa',
    'Putra',
    '+6281230001111',
    'delivery1@example.com',
    true
  )
  ON CONFLICT (username) DO UPDATE
    SET role = EXCLUDED.role,
        password_hash = EXCLUDED.password_hash,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        phone_number = EXCLUDED.phone_number,
        email = EXCLUDED.email,
        is_active = true,
        deleted_at = NULL,
        updated_at = now()
  RETURNING id INTO v_delivery_user_id;

  INSERT INTO user_preferences (user_id, onboarding_completed, dark_mode_enabled, tooltips_enabled)
  VALUES (v_delivery_user_id, true, false, true)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO delivery_school_assignments (delivery_user_id, school_id, is_active, updated_at)
  VALUES (v_delivery_user_id, v_school_id, true, now())
  ON CONFLICT (delivery_user_id, school_id) DO UPDATE
    SET is_active = true,
        updated_at = now();

  UPDATE delivery_school_assignments
  SET is_active = false,
      updated_at = now()
  WHERE (delivery_user_id, school_id) <> (v_delivery_user_id, v_school_id);

  UPDATE users
  SET is_active = false,
      deleted_at = COALESCE(deleted_at, now()),
      updated_at = now()
  WHERE role = 'DELIVERY'
    AND username <> 'delivery_dewa_putra';
END $$;

COMMIT;
