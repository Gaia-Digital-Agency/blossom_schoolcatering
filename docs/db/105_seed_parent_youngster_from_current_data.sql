BEGIN;

-- Future-use parent + youngster seed from provided registration data.
-- Backdoor password for seeded registrations: teameditor123

DO $$
DECLARE
  v_password_hash text := crypt('teameditor123', gen_salt('bf'));
  rec record;
  v_school_id uuid;
  v_parent_user_id uuid;
  v_parent_id uuid;
  v_child_user_id uuid;
  v_child_id uuid;
  v_parent_username text;
  v_child_username text;
  v_parent_email text;
  v_child_email text;
  v_parent_name_tag text;
  v_child_name_tag text;
BEGIN
  FOR rec IN
    SELECT *
    FROM (
      VALUES
        ('Parent01', 'Parent01', 'Youngster0A', 'Parent01', 'Bali Island School', 'azlan@gaiada', '+628176917122'),
        ('Parent02', 'Parent02', 'Youngster0B', 'Parent02', 'GMIS', 'azlan@gaiada', '+628176917122'),
        ('Parent02', 'Parent02', 'Youngster0C', 'Parent02', 'Garden Early Learning', 'azlan@gaiada', '+628176917122'),
        ('Parent03', 'Parent03', 'Youngster0D', 'Parent03', 'Little Star Bali', 'azlan@gaiada', '+628176917122'),
        ('Parent03', 'Parent03', 'Youngster0E', 'Parent03', 'Rumah Kecil Learning', 'azlan@gaiada', '+628176917122'),
        ('Parent03', 'Parent03', 'Youngster0F', 'Parent03', 'Sanur Indepenent', 'azlan@gaiada', '+628176917122')
    ) AS t(parent_first_name, parent_last_name, child_first_name, child_last_name, school_name, email, phone)
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

    v_parent_name_tag := lower(regexp_replace(rec.parent_last_name, '[^a-zA-Z0-9]+', '', 'g'));
    v_child_name_tag := lower(regexp_replace(rec.child_first_name, '[^a-zA-Z0-9]+', '', 'g'));

    v_parent_username := lower(regexp_replace(rec.parent_last_name, '[^a-zA-Z0-9]+', '', 'g'));

    v_child_username := lower(regexp_replace(rec.child_first_name, '[^a-zA-Z0-9]+', '', 'g'));

    IF position('@' IN coalesce(rec.email, '')) > 0 THEN
      v_parent_email := format('%s+%s@%s', split_part(rec.email, '@', 1), v_parent_name_tag, split_part(rec.email, '@', 2));
      v_child_email := format('%s+%s@%s', split_part(rec.email, '@', 1), v_child_name_tag, split_part(rec.email, '@', 2));
    ELSE
      v_parent_email := format('%s+%s', coalesce(nullif(rec.email, ''), 'parent_seed'), v_parent_name_tag);
      v_child_email := format('%s+%s', coalesce(nullif(rec.email, ''), 'youngster_seed'), v_child_name_tag);
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
      'PARENT',
      v_parent_username,
      v_password_hash,
      rec.parent_first_name,
      rec.parent_last_name,
      rec.phone,
      v_parent_email,
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
      'CHILD',
      v_child_username,
      v_password_hash,
      rec.child_first_name,
      rec.child_last_name,
      rec.phone,
      v_child_email,
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
  v_target_parent_usernames text[] := ARRAY[
    'parent01',
    'parent02',
    'parent03'
  ];
  v_target_child_usernames text[] := ARRAY[
    'youngster0a',
    'youngster0b',
    'youngster0c',
    'youngster0d',
    'youngster0e',
    'youngster0f'
  ];
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

  DELETE FROM favourite_meal_items
  WHERE favourite_meal_id IN (
    SELECT fm.id
    FROM favourite_meals fm
    WHERE fm.child_id IN (
      SELECT c.id
      FROM children c
      JOIN users u ON u.id = c.user_id
      WHERE u.role = 'CHILD'
        AND u.username <> ALL(v_target_child_usernames)
    )
    OR fm.created_by_user_id IN (
      SELECT u.id
      FROM users u
      WHERE u.role = 'PARENT'
        AND u.username <> ALL(v_target_parent_usernames)
    )
  );

  DELETE FROM favourite_meals
  WHERE child_id IN (
    SELECT c.id
    FROM children c
    JOIN users u ON u.id = c.user_id
    WHERE u.role = 'CHILD'
      AND u.username <> ALL(v_target_child_usernames)
  )
  OR created_by_user_id IN (
    SELECT u.id
    FROM users u
    WHERE u.role = 'PARENT'
      AND u.username <> ALL(v_target_parent_usernames)
  );

  DELETE FROM child_badges
  WHERE child_id IN (
    SELECT c.id
    FROM children c
    JOIN users u ON u.id = c.user_id
    WHERE u.role = 'CHILD'
      AND u.username <> ALL(v_target_child_usernames)
  );

  DELETE FROM child_dietary_restrictions
  WHERE child_id IN (
    SELECT c.id
    FROM children c
    JOIN users u ON u.id = c.user_id
    WHERE u.role = 'CHILD'
      AND u.username <> ALL(v_target_child_usernames)
  );

  DELETE FROM digital_receipts
  WHERE billing_record_id IN (
    SELECT br.id
    FROM billing_records br
    WHERE br.order_id IN (
      SELECT o.id
      FROM orders o
      JOIN children c ON c.id = o.child_id
      JOIN users u ON u.id = c.user_id
      WHERE u.role = 'CHILD'
        AND u.username <> ALL(v_target_child_usernames)
    )
    OR br.parent_id IN (
      SELECT p.id
      FROM parents p
      JOIN users u ON u.id = p.user_id
      WHERE u.role = 'PARENT'
        AND u.username <> ALL(v_target_parent_usernames)
    )
  );

  DELETE FROM delivery_assignments
  WHERE order_id IN (
    SELECT o.id
    FROM orders o
    JOIN children c ON c.id = o.child_id
    JOIN users u ON u.id = c.user_id
    WHERE u.role = 'CHILD'
      AND u.username <> ALL(v_target_child_usernames)
  );

  DELETE FROM billing_records
  WHERE order_id IN (
    SELECT o.id
    FROM orders o
    JOIN children c ON c.id = o.child_id
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

  DELETE FROM order_mutations
  WHERE order_id IN (
    SELECT o.id
    FROM orders o
    JOIN children c ON c.id = o.child_id
    JOIN users u ON u.id = c.user_id
    WHERE u.role = 'CHILD'
      AND u.username <> ALL(v_target_child_usernames)
  );

  DELETE FROM order_items
  WHERE order_id IN (
    SELECT o.id
    FROM orders o
    JOIN children c ON c.id = o.child_id
    JOIN users u ON u.id = c.user_id
    WHERE u.role = 'CHILD'
      AND u.username <> ALL(v_target_child_usernames)
  );

  DELETE FROM orders
  WHERE child_id IN (
    SELECT c.id
    FROM children c
    JOIN users u ON u.id = c.user_id
    WHERE u.role = 'CHILD'
      AND u.username <> ALL(v_target_child_usernames)
  );

  DELETE FROM cart_items
  WHERE cart_id IN (
    SELECT oc.id
    FROM order_carts oc
    JOIN children c ON c.id = oc.child_id
    JOIN users u ON u.id = c.user_id
    WHERE u.role = 'CHILD'
      AND u.username <> ALL(v_target_child_usernames)
  );

  DELETE FROM order_carts
  WHERE child_id IN (
    SELECT c.id
    FROM children c
    JOIN users u ON u.id = c.user_id
    WHERE u.role = 'CHILD'
      AND u.username <> ALL(v_target_child_usernames)
  );

  DELETE FROM children
  WHERE user_id IN (
    SELECT u.id
    FROM users u
    WHERE u.role = 'CHILD'
      AND u.username <> ALL(v_target_child_usernames)
  );

  DELETE FROM parents
  WHERE user_id IN (
    SELECT u.id
    FROM users u
    WHERE u.role = 'PARENT'
      AND u.username <> ALL(v_target_parent_usernames)
  );

  DELETE FROM user_identities
  WHERE user_id IN (
    SELECT u.id
    FROM users u
    WHERE (u.role = 'PARENT' AND u.username <> ALL(v_target_parent_usernames))
       OR (u.role = 'CHILD' AND u.username <> ALL(v_target_child_usernames))
  );

  DELETE FROM user_preferences
  WHERE user_id IN (
    SELECT u.id
    FROM users u
    WHERE (u.role = 'PARENT' AND u.username <> ALL(v_target_parent_usernames))
       OR (u.role = 'CHILD' AND u.username <> ALL(v_target_child_usernames))
  );

  DELETE FROM users
  WHERE (role = 'PARENT' AND username <> ALL(v_target_parent_usernames))
     OR (role = 'CHILD' AND username <> ALL(v_target_child_usernames));
END $$;

COMMIT;
