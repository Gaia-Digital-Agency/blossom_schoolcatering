BEGIN;

-- Future-use menu seed snapshot based on current menu data.

DO $$
DECLARE
  v_service_date date;
  v_menu_id uuid;
  v_menu_item_id uuid;
BEGIN
  -- Next Monday; if today is Monday, use next week's Monday.
  v_service_date := (current_date + ((8 - extract(isodow FROM current_date)::int) % 7))::date;
  IF v_service_date = current_date THEN
    v_service_date := current_date + 7;
  END IF;

  INSERT INTO menus (session, service_date, is_published)
  VALUES ('LUNCH', v_service_date, true)
  ON CONFLICT (session, service_date) DO UPDATE
    SET is_published = true,
        updated_at = now()
  RETURNING id INTO v_menu_id;

  IF v_menu_id IS NULL THEN
    SELECT id INTO v_menu_id
    FROM menus
    WHERE session = 'LUNCH' AND service_date = v_service_date
    LIMIT 1;
  END IF;

  INSERT INTO ingredients (name, is_active, allergen_flag)
  SELECT i.name, true, i.allergen
  FROM (
    VALUES
      ('Chicken', false),
      ('Rice', false),
      ('Soy Sauce', true)
  ) AS i(name, allergen)
  WHERE NOT EXISTS (
    SELECT 1 FROM ingredients x WHERE lower(x.name) = lower(i.name)
  );

  SELECT id INTO v_menu_item_id
  FROM menu_items
  WHERE lower(name) = lower('Chicken Teriyaki Rice Bowl')
  LIMIT 1;

  IF v_menu_item_id IS NULL THEN
    INSERT INTO menu_items (
      menu_id,
      name,
      description,
      nutrition_facts_text,
      price,
      image_url,
      is_available,
      display_order,
      dish_category,
      is_vegetarian,
      is_gluten_free,
      is_dairy_free,
      contains_peanut
    )
    VALUES (
      v_menu_id,
      'Chicken Teriyaki Rice Bowl',
      'Low sugar option available',
      'Allergen tags: soy',
      25000.00,
      '/menu/shawarma.webp',
      true,
      1,
      'MAIN',
      false,
      false,
      true,
      false
    )
    RETURNING id INTO v_menu_item_id;
  ELSE
    UPDATE menu_items
    SET menu_id = v_menu_id,
        description = 'Low sugar option available',
        nutrition_facts_text = 'Allergen tags: soy',
        price = 25000.00,
        image_url = '/menu/shawarma.webp',
        is_available = true,
        display_order = 1,
        dish_category = 'MAIN',
        is_vegetarian = false,
        is_gluten_free = false,
        is_dairy_free = true,
        contains_peanut = false,
        updated_at = now()
    WHERE id = v_menu_item_id;
  END IF;

  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id)
  SELECT v_menu_item_id, i.id
  FROM ingredients i
  WHERE lower(i.name) IN (lower('Chicken'), lower('Rice'), lower('Soy Sauce'))
    AND NOT EXISTS (
      SELECT 1
      FROM menu_item_ingredients mi
      WHERE mi.menu_item_id = v_menu_item_id AND mi.ingredient_id = i.id
    );

  UPDATE menu_items
  SET is_available = false,
      deleted_at = COALESCE(deleted_at, now()),
      updated_at = now()
  WHERE id <> v_menu_item_id;

  UPDATE menu_items
  SET is_available = true,
      deleted_at = NULL,
      updated_at = now()
  WHERE id = v_menu_item_id;

  UPDATE menus
  SET is_published = false,
      deleted_at = COALESCE(deleted_at, now()),
      updated_at = now()
  WHERE id <> v_menu_id;

  UPDATE menus
  SET is_published = true,
      deleted_at = NULL,
      updated_at = now()
  WHERE id = v_menu_id;
END $$;

COMMIT;
