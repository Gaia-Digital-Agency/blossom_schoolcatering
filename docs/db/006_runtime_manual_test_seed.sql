BEGIN;

DO $$
DECLARE
  v_parent_user_id uuid;
  v_youngster_user_id uuid;
  v_delivery_user_id uuid;
  v_admin_user_id uuid;
  v_parent_id uuid;
  v_youngster_id uuid;
  v_school_id uuid;
  v_menu_lunch_id uuid;
  v_menu_snack_id uuid;
  v_menu_breakfast_id uuid;
  v_lunch_item_id uuid;
  v_snack_item_id uuid;
  v_breakfast_item_id uuid;
  v_order_id uuid;
  v_billing_id uuid;
  v_date date := DATE '2026-03-02';
BEGIN
  SELECT id INTO v_parent_user_id FROM users WHERE username = 'parent' AND is_active = true LIMIT 1;
  SELECT id INTO v_youngster_user_id FROM users WHERE username = 'youngster' AND is_active = true LIMIT 1;
  SELECT id INTO v_delivery_user_id FROM users WHERE username = 'delivery' AND is_active = true LIMIT 1;
  SELECT id INTO v_admin_user_id FROM users WHERE username = 'admin' AND is_active = true LIMIT 1;

  IF v_parent_user_id IS NULL OR v_youngster_user_id IS NULL OR v_delivery_user_id IS NULL OR v_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Missing default users (admin/parent/youngster/delivery)';
  END IF;

  INSERT INTO schools (name, address, city, contact_email, contact_phone, is_active)
  SELECT 'Blossom Test School', 'Jl. Test No. 1', 'Denpasar', 'testschool@blossom.local', '6200000001', true
  WHERE NOT EXISTS (SELECT 1 FROM schools WHERE lower(name) = lower('Blossom Test School'));

  SELECT id INTO v_school_id FROM schools WHERE lower(name) = lower('Blossom Test School') LIMIT 1;

  INSERT INTO parents (user_id, address)
  SELECT v_parent_user_id, 'Jl. Parent Test No. 9'
  WHERE NOT EXISTS (SELECT 1 FROM parents WHERE user_id = v_parent_user_id);

  SELECT id INTO v_parent_id FROM parents WHERE user_id = v_parent_user_id LIMIT 1;

  INSERT INTO children (user_id, school_id, date_of_birth, gender, school_grade, photo_url, is_active)
  SELECT v_youngster_user_id, v_school_id, DATE '2015-05-20', 'MALE'::gender_type, 'Grade 5', NULL, true
  WHERE NOT EXISTS (SELECT 1 FROM children WHERE user_id = v_youngster_user_id AND deleted_at IS NULL);

  SELECT id INTO v_youngster_id FROM children WHERE user_id = v_youngster_user_id AND deleted_at IS NULL LIMIT 1;

  INSERT INTO parent_children (parent_id, child_id)
  SELECT v_parent_id, v_youngster_id
  WHERE NOT EXISTS (SELECT 1 FROM parent_children WHERE parent_id = v_parent_id AND child_id = v_youngster_id);

  INSERT INTO child_dietary_restrictions (child_id, restriction_label, restriction_details, is_active)
  SELECT v_youngster_id, 'ALLERGIES', 'No Allergies', true
  WHERE NOT EXISTS (
    SELECT 1 FROM child_dietary_restrictions
    WHERE child_id = v_youngster_id
      AND upper(restriction_label) = 'ALLERGIES'
      AND deleted_at IS NULL
  );

  INSERT INTO ingredients (name, is_active, allergen_flag, notes)
  SELECT 'QA Chicken', true, false, NULL
  WHERE NOT EXISTS (SELECT 1 FROM ingredients WHERE lower(name) = lower('QA Chicken'));

  INSERT INTO ingredients (name, is_active, allergen_flag, notes)
  SELECT 'QA Rice', true, false, NULL
  WHERE NOT EXISTS (SELECT 1 FROM ingredients WHERE lower(name) = lower('QA Rice'));

  INSERT INTO ingredients (name, is_active, allergen_flag, notes)
  SELECT 'QA Egg', true, true, 'Test allergen'
  WHERE NOT EXISTS (SELECT 1 FROM ingredients WHERE lower(name) = lower('QA Egg'));

  INSERT INTO menus (session, service_date, is_published)
  VALUES ('LUNCH', v_date, true)
  ON CONFLICT (session, service_date) DO UPDATE SET is_published = true, updated_at = now();

  INSERT INTO menus (session, service_date, is_published)
  VALUES ('SNACK', v_date, true)
  ON CONFLICT (session, service_date) DO UPDATE SET is_published = true, updated_at = now();

  INSERT INTO menus (session, service_date, is_published)
  VALUES ('BREAKFAST', v_date, true)
  ON CONFLICT (session, service_date) DO UPDATE SET is_published = true, updated_at = now();

  SELECT id INTO v_menu_lunch_id FROM menus WHERE session = 'LUNCH' AND service_date = v_date LIMIT 1;
  SELECT id INTO v_menu_snack_id FROM menus WHERE session = 'SNACK' AND service_date = v_date LIMIT 1;
  SELECT id INTO v_menu_breakfast_id FROM menus WHERE session = 'BREAKFAST' AND service_date = v_date LIMIT 1;

  INSERT INTO menu_items (menu_id, name, description, nutrition_facts_text, price, image_url, is_available, display_order, cutlery_required, packing_requirement, calories_kcal)
  SELECT v_menu_lunch_id, 'QA Youngster Lunch Bowl', 'QA lunch dish', 'Protein + carb', 32000, '/schoolcatering/assets/hero-meal.jpg', true, 1, true, 'Lunch box + spoon', 520
  WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE lower(name) = lower('QA Youngster Lunch Bowl'));

  INSERT INTO menu_items (menu_id, name, description, nutrition_facts_text, price, image_url, is_available, display_order, cutlery_required, packing_requirement, calories_kcal)
  SELECT v_menu_snack_id, 'QA Youngster Snack Pack', 'QA snack dish', 'Light snack', 18000, '/schoolcatering/assets/hero-meal.jpg', true, 1, true, 'Snack pouch', 220
  WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE lower(name) = lower('QA Youngster Snack Pack'));

  INSERT INTO menu_items (menu_id, name, description, nutrition_facts_text, price, image_url, is_available, display_order, cutlery_required, packing_requirement, calories_kcal)
  SELECT v_menu_breakfast_id, 'QA Youngster Breakfast Plate', 'QA breakfast dish', 'Balanced breakfast', 25000, '/schoolcatering/assets/hero-meal.jpg', true, 1, true, 'Plate cover', 380
  WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE lower(name) = lower('QA Youngster Breakfast Plate'));

  SELECT id INTO v_lunch_item_id FROM menu_items WHERE lower(name) = lower('QA Youngster Lunch Bowl') LIMIT 1;
  SELECT id INTO v_snack_item_id FROM menu_items WHERE lower(name) = lower('QA Youngster Snack Pack') LIMIT 1;
  SELECT id INTO v_breakfast_item_id FROM menu_items WHERE lower(name) = lower('QA Youngster Breakfast Plate') LIMIT 1;

  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id)
  SELECT v_lunch_item_id, i.id FROM ingredients i
  WHERE i.name IN ('QA Chicken', 'QA Rice')
    AND NOT EXISTS (SELECT 1 FROM menu_item_ingredients x WHERE x.menu_item_id = v_lunch_item_id AND x.ingredient_id = i.id);

  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id)
  SELECT v_snack_item_id, i.id FROM ingredients i
  WHERE i.name IN ('QA Egg')
    AND NOT EXISTS (SELECT 1 FROM menu_item_ingredients x WHERE x.menu_item_id = v_snack_item_id AND x.ingredient_id = i.id);

  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id)
  SELECT v_breakfast_item_id, i.id FROM ingredients i
  WHERE i.name IN ('QA Egg', 'QA Rice')
    AND NOT EXISTS (SELECT 1 FROM menu_item_ingredients x WHERE x.menu_item_id = v_breakfast_item_id AND x.ingredient_id = i.id);

  SELECT id INTO v_order_id
  FROM orders
  WHERE child_id = v_youngster_id
    AND session = 'LUNCH'::session_type
    AND service_date = v_date
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_order_id IS NULL THEN
    INSERT INTO orders (child_id, placed_by_user_id, session, service_date, status, total_price, dietary_snapshot, delivery_status)
    VALUES (v_youngster_id, v_parent_user_id, 'LUNCH', v_date, 'PLACED', 64000, 'ALLERGIES: No Allergies', 'PENDING')
    RETURNING id INTO v_order_id;
  END IF;

  INSERT INTO order_items (order_id, menu_item_id, item_name_snapshot, price_snapshot, quantity)
  SELECT v_order_id, v_lunch_item_id, 'QA Youngster Lunch Bowl', 32000, 2
  WHERE NOT EXISTS (SELECT 1 FROM order_items WHERE order_id = v_order_id AND menu_item_id = v_lunch_item_id);

  UPDATE orders o
  SET total_price = COALESCE((
    SELECT SUM(oi.price_snapshot * oi.quantity)
    FROM order_items oi
    WHERE oi.order_id = o.id
  ), 0),
  updated_at = now()
  WHERE o.id = v_order_id;

  INSERT INTO billing_records (order_id, parent_id, status, delivery_status)
  SELECT v_order_id, v_parent_id, 'UNPAID', 'PENDING'
  WHERE NOT EXISTS (SELECT 1 FROM billing_records WHERE order_id = v_order_id);

  SELECT id INTO v_billing_id FROM billing_records WHERE order_id = v_order_id LIMIT 1;

  CREATE TABLE IF NOT EXISTS delivery_school_assignments (
    delivery_user_id uuid NOT NULL REFERENCES users(id),
    school_id uuid NOT NULL REFERENCES schools(id),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (delivery_user_id, school_id)
  );

  INSERT INTO delivery_school_assignments (delivery_user_id, school_id, is_active, updated_at)
  VALUES (v_delivery_user_id, v_school_id, true, now())
  ON CONFLICT (delivery_user_id, school_id) DO UPDATE SET is_active = EXCLUDED.is_active, updated_at = now();

  INSERT INTO delivery_assignments (order_id, delivery_user_id)
  SELECT v_order_id, v_delivery_user_id
  WHERE NOT EXISTS (SELECT 1 FROM delivery_assignments WHERE order_id = v_order_id);

  CREATE TABLE IF NOT EXISTS session_settings (
    session session_type PRIMARY KEY,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  INSERT INTO session_settings (session, is_active)
  VALUES ('LUNCH', true), ('SNACK', true), ('BREAKFAST', true)
  ON CONFLICT (session) DO UPDATE SET is_active = EXCLUDED.is_active, updated_at = now();

  RAISE NOTICE 'Seed completed. parent_id=%, youngster_id=%, school_id=%, order_id=%, billing_id=%', v_parent_id, v_youngster_id, v_school_id, v_order_id, v_billing_id;
END $$;

COMMIT;
