BEGIN;

-- Canonical parent + youngster seed baseline (future use).
-- Keep only 3 parent + 6 youngster accounts and hard-delete non-target rows when unreferenced.
-- Backdoor password: Teameditor@123

DO $$
DECLARE
  v_password_hash text := crypt('Teameditor@123', gen_salt('bf'));
  rec record;
  v_school_id uuid;
  v_parent_user_id uuid;
  v_parent_id uuid;
  v_child_user_id uuid;
  v_child_id uuid;
  v_parent_email text;
  v_child_email text;
BEGIN
  FOR rec IN
    SELECT *
    FROM (
      VALUES
        ('parent01', 'Parent01', 'Parent01', 'youngster0a', 'Youngster0A', 'Parent01', 'Bali Island School', 'azlan@gaiada', '+628176917122'),
        ('parent02', 'Parent02', 'Parent02', 'youngster0b', 'Youngster0B', 'Parent02', 'Gandhi Memorial Intercontinental School (GMIS)', 'azlan@gaiada', '+628176917122'),
        ('parent02', 'Parent02', 'Parent02', 'youngster0c', 'Youngster0C', 'Parent02', 'Garden Early Learning Center', 'azlan@gaiada', '+628176917122'),
        ('parent03', 'Parent03', 'Parent03', 'youngster0d', 'Youngster0D', 'Parent03', 'Little Stars Bali Learning Kindergarten', 'azlan@gaiada', '+628176917122'),
        ('parent03', 'Parent03', 'Parent03', 'youngster0e', 'Youngster0E', 'Parent03', 'Rumah Kecil Learning Centre', 'azlan@gaiada', '+628176917122'),
        ('parent03', 'Parent03', 'Parent03', 'youngster0f', 'Youngster0F', 'Parent03', 'Sanur Independent School', 'azlan@gaiada', '+628176917122')
    ) AS t(parent_username, parent_first_name, parent_last_name, child_username, child_first_name, child_last_name, school_name, base_email, phone)
  LOOP
    SELECT id INTO v_school_id
    FROM schools
    WHERE lower(name) = lower(rec.school_name)
    LIMIT 1;

    IF v_school_id IS NULL THEN
      INSERT INTO schools (name, is_active)
      VALUES (rec.school_name, true)
      RETURNING id INTO v_school_id;
    END IF;

    v_parent_email := format('%s+%s@%s', split_part(rec.base_email, '@', 1), rec.parent_username, split_part(rec.base_email, '@', 2));
    v_child_email := format('%s+%s@%s', split_part(rec.base_email, '@', 1), rec.child_username, split_part(rec.base_email, '@', 2));

    INSERT INTO users (role, username, password_hash, first_name, last_name, phone_number, email, is_active)
    VALUES ('PARENT', rec.parent_username, v_password_hash, rec.parent_first_name, rec.parent_last_name, rec.phone, v_parent_email, true)
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
    RETURNING id INTO v_parent_user_id;

    INSERT INTO user_preferences (user_id, onboarding_completed, dark_mode_enabled, tooltips_enabled)
    VALUES (v_parent_user_id, true, false, true)
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO parents (user_id, address)
    VALUES (v_parent_user_id, 'Seed address - update as needed')
    ON CONFLICT (user_id) DO NOTHING;

    SELECT id INTO v_parent_id
    FROM parents
    WHERE user_id = v_parent_user_id
    LIMIT 1;

    INSERT INTO users (role, username, password_hash, first_name, last_name, phone_number, email, is_active)
    VALUES ('CHILD', rec.child_username, v_password_hash, rec.child_first_name, rec.child_last_name, rec.phone, v_child_email, true)
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
    RETURNING id INTO v_child_user_id;

    INSERT INTO user_preferences (user_id, onboarding_completed, dark_mode_enabled, tooltips_enabled)
    VALUES (v_child_user_id, true, false, true)
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO children (
      user_id,
      school_id,
      date_of_birth,
      gender,
      school_grade,
      registration_actor_type,
      registration_actor_teacher_name,
      photo_url,
      is_active
    )
    VALUES (
      v_child_user_id,
      v_school_id,
      DATE '2016-01-01',
      'UNDISCLOSED',
      'Grade 1',
      'PARENT',
      NULL,
      NULL,
      true
    )
    ON CONFLICT (user_id) DO UPDATE
      SET school_id = EXCLUDED.school_id,
          is_active = true,
          deleted_at = NULL,
          updated_at = now();

    SELECT id INTO v_child_id
    FROM children
    WHERE user_id = v_child_user_id
    LIMIT 1;

    INSERT INTO parent_children (parent_id, child_id)
    VALUES (v_parent_id, v_child_id)
    ON CONFLICT (parent_id, child_id) DO NOTHING;
  END LOOP;
END $$;

DO $$
DECLARE
  v_target_parent_usernames text[] := ARRAY['parent01', 'parent02', 'parent03'];
  v_target_child_usernames text[] := ARRAY['youngster0a', 'youngster0b', 'youngster0c', 'youngster0d', 'youngster0e', 'youngster0f'];
BEGIN
  DELETE FROM parent_children
  WHERE child_id IN (
    SELECT c.id
    FROM children c
    JOIN users u ON u.id = c.user_id
    WHERE u.role = 'CHILD'
      AND u.username <> ALL(v_target_child_usernames)
  )
  OR parent_id IN (
    SELECT p.id
    FROM parents p
    JOIN users u ON u.id = p.user_id
    WHERE u.role = 'PARENT'
      AND u.username <> ALL(v_target_parent_usernames)
  );

  DELETE FROM children c
  USING users u
  WHERE c.user_id = u.id
    AND u.role = 'CHILD'
    AND u.username <> ALL(v_target_child_usernames)
    AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.child_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM order_carts oc WHERE oc.child_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM favourite_meals fm WHERE fm.child_id = c.id);

  DELETE FROM parents p
  USING users u
  WHERE p.user_id = u.id
    AND u.role = 'PARENT'
    AND u.username <> ALL(v_target_parent_usernames)
    AND NOT EXISTS (SELECT 1 FROM order_carts oc WHERE oc.created_by_user_id = u.id)
    AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.placed_by_user_id = u.id);

  DELETE FROM auth_refresh_sessions ars
  USING users u
  WHERE ars.user_id = u.id
    AND ((u.role = 'PARENT' AND u.username <> ALL(v_target_parent_usernames))
      OR (u.role = 'CHILD' AND u.username <> ALL(v_target_child_usernames)));

  DELETE FROM user_identities ui
  USING users u
  WHERE ui.user_id = u.id
    AND ((u.role = 'PARENT' AND u.username <> ALL(v_target_parent_usernames))
      OR (u.role = 'CHILD' AND u.username <> ALL(v_target_child_usernames)));

  DELETE FROM user_preferences up
  USING users u
  WHERE up.user_id = u.id
    AND ((u.role = 'PARENT' AND u.username <> ALL(v_target_parent_usernames))
      OR (u.role = 'CHILD' AND u.username <> ALL(v_target_child_usernames)));

  DELETE FROM users u
  WHERE ((u.role = 'PARENT' AND u.username <> ALL(v_target_parent_usernames))
      OR (u.role = 'CHILD' AND u.username <> ALL(v_target_child_usernames)))
    AND NOT EXISTS (SELECT 1 FROM parents p WHERE p.user_id = u.id)
    AND NOT EXISTS (SELECT 1 FROM children c WHERE c.user_id = u.id)
    AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.placed_by_user_id = u.id OR o.delivered_by_user_id = u.id)
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
