BEGIN;

-- Canonical delivery seed baseline (future use).
-- Keep only target delivery users + target delivery-school assignments.
-- Hard-delete non-target assignments, and hard-delete non-target delivery users when unreferenced.
-- Backdoor password: Teameditor@123

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
  v_password_hash text := crypt('Teameditor@123', gen_salt('bf'));
  rec_user record;
BEGIN
  WITH target_schools(name) AS (
    VALUES
      ('Bali Island School'),
      ('Gandhi Memorial Intercontinental School (GMIS)'),
      ('Garden Early Learning Center'),
      ('Little Stars Bali Learning Kindergarten'),
      ('Rumah Kecil Learning Centre'),
      ('Sanur Independent School')
  )
  INSERT INTO schools (name, is_active)
  SELECT ts.name, true
  FROM target_schools ts
  WHERE NOT EXISTS (
    SELECT 1 FROM schools s WHERE lower(s.name) = lower(ts.name)
  );

  WITH target_schools(name) AS (
    VALUES
      ('Bali Island School'),
      ('Gandhi Memorial Intercontinental School (GMIS)'),
      ('Garden Early Learning Center'),
      ('Little Stars Bali Learning Kindergarten'),
      ('Rumah Kecil Learning Centre'),
      ('Sanur Independent School')
  )
  UPDATE schools s
  SET is_active = true,
      deleted_at = NULL,
      updated_at = now()
  FROM target_schools ts
  WHERE lower(s.name) = lower(ts.name);

  FOR rec_user IN
    SELECT *
    FROM (
      VALUES
        ('crud_delivery_066487', 'George', 'Hamilton', '+6281805598875', 'gusde@gaiada.com'),
        ('crud_delivery_872251', 'Tony', 'Stark', '+628123894471', 'anthony@gaiada.com'),
        ('crud_delivery_934734', 'Brett', 'Pitt', '+62822322841296', 'info@gaiada.com'),
        ('delivery', 'Simon', 'Templer', '+6281197252867', 'simon@gaiada.com'),
        ('delivery_team1', 'Edward', 'Norton', '+6289605487000', 'edward@gaiada.com'),
        ('delivery_test_a', 'Aslan', 'Simba', '+628176917122', 'azlan@gaiada.com'),
        ('sat_delivery_new_029438', 'Arian', 'Grande', '+6282237917395', 'arie@gaiada.com')
    ) AS t(username, first_name, last_name, phone_number, email)
  LOOP
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
      rec_user.username,
      v_password_hash,
      rec_user.first_name,
      rec_user.last_name,
      rec_user.phone_number,
      rec_user.email,
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
          updated_at = now();

    INSERT INTO user_preferences (user_id, onboarding_completed, dark_mode_enabled, tooltips_enabled)
    SELECT u.id, true, false, true
    FROM users u
    WHERE u.username = rec_user.username
    ON CONFLICT (user_id) DO NOTHING;
  END LOOP;

  WITH target_assignments(username, school_name) AS (
    VALUES
      ('crud_delivery_066487', 'Bali Island School'),
      ('crud_delivery_066487', 'Garden Early Learning Center'),
      ('crud_delivery_872251', 'Bali Island School'),
      ('crud_delivery_872251', 'Rumah Kecil Learning Centre'),
      ('crud_delivery_934734', 'Rumah Kecil Learning Centre'),
      ('crud_delivery_934734', 'Sanur Independent School'),
      ('delivery', 'Garden Early Learning Center'),
      ('delivery', 'Little Stars Bali Learning Kindergarten'),
      ('delivery_team1', 'Little Stars Bali Learning Kindergarten'),
      ('delivery_team1', 'Sanur Independent School'),
      ('delivery_test_a', 'Gandhi Memorial Intercontinental School (GMIS)'),
      ('sat_delivery_new_029438', 'Gandhi Memorial Intercontinental School (GMIS)')
  )
  INSERT INTO delivery_school_assignments (delivery_user_id, school_id, is_active, updated_at)
  SELECT u.id, s.id, true, now()
  FROM target_assignments ta
  JOIN users u ON lower(u.username) = lower(ta.username)
  JOIN schools s ON lower(s.name) = lower(ta.school_name)
  ON CONFLICT (delivery_user_id, school_id) DO UPDATE
    SET is_active = true,
        updated_at = now();

  WITH target_assignments(username, school_name) AS (
    VALUES
      ('crud_delivery_066487', 'Bali Island School'),
      ('crud_delivery_066487', 'Garden Early Learning Center'),
      ('crud_delivery_872251', 'Bali Island School'),
      ('crud_delivery_872251', 'Rumah Kecil Learning Centre'),
      ('crud_delivery_934734', 'Rumah Kecil Learning Centre'),
      ('crud_delivery_934734', 'Sanur Independent School'),
      ('delivery', 'Garden Early Learning Center'),
      ('delivery', 'Little Stars Bali Learning Kindergarten'),
      ('delivery_team1', 'Little Stars Bali Learning Kindergarten'),
      ('delivery_team1', 'Sanur Independent School'),
      ('delivery_test_a', 'Gandhi Memorial Intercontinental School (GMIS)'),
      ('sat_delivery_new_029438', 'Gandhi Memorial Intercontinental School (GMIS)')
  ),
  doomed AS (
    SELECT dsa.delivery_user_id, dsa.school_id
    FROM delivery_school_assignments dsa
    WHERE NOT EXISTS (
      SELECT 1
      FROM target_assignments ta
      JOIN users u ON lower(u.username) = lower(ta.username)
      JOIN schools s ON lower(s.name) = lower(ta.school_name)
      WHERE u.id = dsa.delivery_user_id
        AND s.id = dsa.school_id
    )
  )
  DELETE FROM delivery_school_assignments dsa
  USING doomed d
  WHERE dsa.delivery_user_id = d.delivery_user_id
    AND dsa.school_id = d.school_id;

  DELETE FROM auth_refresh_sessions ars
  USING users u
  WHERE ars.user_id = u.id
    AND u.role = 'DELIVERY'
    AND u.username NOT IN (
      'crud_delivery_066487',
      'crud_delivery_872251',
      'crud_delivery_934734',
      'delivery',
      'delivery_team1',
      'delivery_test_a',
      'sat_delivery_new_029438'
    );

  DELETE FROM user_identities ui
  USING users u
  WHERE ui.user_id = u.id
    AND u.role = 'DELIVERY'
    AND u.username NOT IN (
      'crud_delivery_066487',
      'crud_delivery_872251',
      'crud_delivery_934734',
      'delivery',
      'delivery_team1',
      'delivery_test_a',
      'sat_delivery_new_029438'
    );

  DELETE FROM user_preferences up
  USING users u
  WHERE up.user_id = u.id
    AND u.role = 'DELIVERY'
    AND u.username NOT IN (
      'crud_delivery_066487',
      'crud_delivery_872251',
      'crud_delivery_934734',
      'delivery',
      'delivery_team1',
      'delivery_test_a',
      'sat_delivery_new_029438'
    );

  DELETE FROM users u
  WHERE u.role = 'DELIVERY'
    AND u.username NOT IN (
      'crud_delivery_066487',
      'crud_delivery_872251',
      'crud_delivery_934734',
      'delivery',
      'delivery_team1',
      'delivery_test_a',
      'sat_delivery_new_029438'
    )
    AND NOT EXISTS (SELECT 1 FROM delivery_school_assignments dsa WHERE dsa.delivery_user_id = u.id)
    AND NOT EXISTS (SELECT 1 FROM delivery_assignments da WHERE da.delivery_user_id = u.id)
    AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.delivered_by_user_id = u.id)
    AND NOT EXISTS (SELECT 1 FROM order_carts oc WHERE oc.created_by_user_id = u.id)
    AND NOT EXISTS (SELECT 1 FROM order_mutations om WHERE om.actor_user_id = u.id)
    AND NOT EXISTS (SELECT 1 FROM billing_records br WHERE br.verified_by = u.id)
    AND NOT EXISTS (SELECT 1 FROM digital_receipts dr WHERE dr.generated_by_user_id = u.id)
    AND NOT EXISTS (SELECT 1 FROM favourite_meals fm WHERE fm.created_by_user_id = u.id)
    AND NOT EXISTS (SELECT 1 FROM menu_item_ratings mir WHERE mir.user_id = u.id)
    AND NOT EXISTS (SELECT 1 FROM blackout_days bd WHERE bd.created_by = u.id)
    AND NOT EXISTS (SELECT 1 FROM admin_audit_logs aal WHERE aal.actor_user_id = u.id);
END $$;

COMMIT;
