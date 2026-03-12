BEGIN;

-- Canonical menu seed baseline (future use).
-- Enforce current baseline:
-- 1) Keep only active LUNCH dishes.
-- 2) Hard-delete SNACK and BREAKFAST dishes.
-- 3) Hard-delete all non-active dishes.

DO $$
BEGIN
  -- Hard-delete non-LUNCH or non-active dishes and all dependent rows.
  WITH doomed AS (
    SELECT mi.id
    FROM menu_items mi
    JOIN menus m ON m.id = mi.menu_id
    WHERE m.session IN ('SNACK', 'BREAKFAST')
       OR mi.deleted_at IS NOT NULL
       OR mi.is_available = false
  )
  DELETE FROM analytics_daily_agg a
  USING doomed d
  WHERE a.menu_item_id = d.id;

  WITH doomed AS (
    SELECT mi.id
    FROM menu_items mi
    JOIN menus m ON m.id = mi.menu_id
    WHERE m.session IN ('SNACK', 'BREAKFAST')
       OR mi.deleted_at IS NOT NULL
       OR mi.is_available = false
  )
  DELETE FROM menu_item_ratings r
  USING doomed d
  WHERE r.menu_item_id = d.id;

  WITH doomed AS (
    SELECT mi.id
    FROM menu_items mi
    JOIN menus m ON m.id = mi.menu_id
    WHERE m.session IN ('SNACK', 'BREAKFAST')
       OR mi.deleted_at IS NOT NULL
       OR mi.is_available = false
  )
  DELETE FROM menu_item_ingredients i
  USING doomed d
  WHERE i.menu_item_id = d.id;

  WITH doomed AS (
    SELECT mi.id
    FROM menu_items mi
    JOIN menus m ON m.id = mi.menu_id
    WHERE m.session IN ('SNACK', 'BREAKFAST')
       OR mi.deleted_at IS NOT NULL
       OR mi.is_available = false
  )
  DELETE FROM favourite_meal_items f
  USING doomed d
  WHERE f.menu_item_id = d.id;

  WITH doomed AS (
    SELECT mi.id
    FROM menu_items mi
    JOIN menus m ON m.id = mi.menu_id
    WHERE m.session IN ('SNACK', 'BREAKFAST')
       OR mi.deleted_at IS NOT NULL
       OR mi.is_available = false
  )
  DELETE FROM cart_items c
  USING doomed d
  WHERE c.menu_item_id = d.id;

  WITH doomed AS (
    SELECT mi.id
    FROM menu_items mi
    JOIN menus m ON m.id = mi.menu_id
    WHERE m.session IN ('SNACK', 'BREAKFAST')
       OR mi.deleted_at IS NOT NULL
       OR mi.is_available = false
  )
  DELETE FROM order_items o
  USING doomed d
  WHERE o.menu_item_id = d.id;

  WITH doomed AS (
    SELECT mi.id
    FROM menu_items mi
    JOIN menus m ON m.id = mi.menu_id
    WHERE m.session IN ('SNACK', 'BREAKFAST')
       OR mi.deleted_at IS NOT NULL
       OR mi.is_available = false
  )
  DELETE FROM menu_items mi
  USING doomed d
  WHERE mi.id = d.id;

  -- Hard-delete empty SNACK/BREAKFAST menus.
  DELETE FROM menus m
  WHERE m.session IN ('SNACK', 'BREAKFAST')
    AND NOT EXISTS (
      SELECT 1 FROM menu_items mi WHERE mi.menu_id = m.id
    );

  -- Keep only LUNCH menus with at least one active dish published and visible.
  UPDATE menus m
  SET is_published = true,
      deleted_at = NULL,
      updated_at = now()
  WHERE m.session = 'LUNCH'
    AND EXISTS (
      SELECT 1
      FROM menu_items mi
      WHERE mi.menu_id = m.id
        AND mi.deleted_at IS NULL
        AND mi.is_available = true
    );
END $$;

COMMIT;
