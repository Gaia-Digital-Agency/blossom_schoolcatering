BEGIN;

-- Canonical menu seed for production/UAT:
-- Clone currently active dishes into a future service date.
--
-- Why:
-- - Current active dishes are the finalized production menu.
-- - Future seeding should reuse those dishes, not sample placeholders.
--
-- How:
-- 1) Set v_target_date.
-- 2) Run this script once for each new menu date.

DO $$
DECLARE
  v_target_date date := DATE '2026-03-03';
  v_session session_type;
  v_source_date date;
  v_target_menu_id uuid;
  v_existing_item_id uuid;
  v_target_item_id uuid;
  src record;
  ing record;
BEGIN
  FOREACH v_session IN ARRAY ARRAY['LUNCH'::session_type, 'SNACK'::session_type, 'BREAKFAST'::session_type]
  LOOP
    SELECT MAX(m.service_date)
    INTO v_source_date
    FROM menus m
    JOIN menu_items mi
      ON mi.menu_id = m.id
     AND mi.deleted_at IS NULL
     AND mi.is_available = true
    WHERE m.session = v_session
      AND m.deleted_at IS NULL;

    IF v_source_date IS NULL THEN
      RAISE NOTICE 'Skip %: no active source dishes found', v_session;
      CONTINUE;
    END IF;

    INSERT INTO menus (session, service_date, is_published)
    VALUES (v_session, v_target_date, true)
    ON CONFLICT (session, service_date)
    DO UPDATE SET is_published = true, updated_at = now()
    RETURNING id INTO v_target_menu_id;

    FOR src IN
      SELECT mi.id,
             mi.name,
             mi.description,
             mi.nutrition_facts_text,
             mi.calories_kcal,
             mi.price,
             mi.image_url,
             mi.is_available,
             mi.display_order,
             mi.cutlery_required,
             mi.packing_requirement,
             mi.is_vegetarian,
             mi.is_gluten_free,
             mi.is_dairy_free,
             mi.contains_peanut,
             COALESCE(NULLIF(mi.dish_category, ''), 'MAIN') AS dish_category
      FROM menu_items mi
      JOIN menus m ON m.id = mi.menu_id
      WHERE m.session = v_session
        AND m.service_date = v_source_date
        AND m.deleted_at IS NULL
        AND mi.deleted_at IS NULL
        AND mi.is_available = true
      ORDER BY mi.display_order, mi.name
    LOOP
      SELECT mi2.id
      INTO v_existing_item_id
      FROM menu_items mi2
      WHERE mi2.menu_id = v_target_menu_id
        AND lower(mi2.name) = lower(src.name)
        AND mi2.deleted_at IS NULL
      LIMIT 1;

      IF v_existing_item_id IS NULL THEN
        INSERT INTO menu_items (
          menu_id, name, description, nutrition_facts_text, calories_kcal, price, image_url, is_available,
          display_order, cutlery_required, packing_requirement,
          is_vegetarian, is_gluten_free, is_dairy_free, contains_peanut, dish_category
        )
        VALUES (
          v_target_menu_id, src.name, src.description, src.nutrition_facts_text, src.calories_kcal, src.price,
          src.image_url, src.is_available, src.display_order, src.cutlery_required, src.packing_requirement,
          src.is_vegetarian, src.is_gluten_free, src.is_dairy_free, src.contains_peanut, src.dish_category
        )
        RETURNING id INTO v_target_item_id;
      ELSE
        UPDATE menu_items
        SET description = src.description,
            nutrition_facts_text = src.nutrition_facts_text,
            calories_kcal = src.calories_kcal,
            price = src.price,
            image_url = src.image_url,
            is_available = src.is_available,
            display_order = src.display_order,
            cutlery_required = src.cutlery_required,
            packing_requirement = src.packing_requirement,
            is_vegetarian = src.is_vegetarian,
            is_gluten_free = src.is_gluten_free,
            is_dairy_free = src.is_dairy_free,
            contains_peanut = src.contains_peanut,
            dish_category = src.dish_category,
            updated_at = now()
        WHERE id = v_existing_item_id;
        v_target_item_id := v_existing_item_id;
      END IF;

      DELETE FROM menu_item_ingredients WHERE menu_item_id = v_target_item_id;

      FOR ing IN
        SELECT ingredient_id
        FROM menu_item_ingredients
        WHERE menu_item_id = src.id
      LOOP
        INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id)
        VALUES (v_target_item_id, ing.ingredient_id)
        ON CONFLICT (menu_item_id, ingredient_id) DO NOTHING;
      END LOOP;
    END LOOP;

    RAISE NOTICE 'Session % cloned from % to %', v_session, v_source_date, v_target_date;
  END LOOP;
END$$;

COMMIT;
