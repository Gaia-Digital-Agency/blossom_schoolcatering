#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required"
  exit 1
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;

WITH target_parents AS (
  SELECT
    p.id AS parent_id,
    p.user_id AS parent_user_id
  FROM parents p
  JOIN users u ON u.id = p.user_id
  WHERE p.deleted_at IS NULL
    AND u.deleted_at IS NULL
    AND (
      regexp_replace(lower(concat_ws(' ', u.username, u.first_name, u.last_name)), '[^a-z0-9]+', ' ', 'g') LIKE '%allergen parent%'
      OR regexp_replace(lower(concat_ws(' ', u.username, u.first_name, u.last_name)), '[^a-z0-9]+', ' ', 'g') LIKE '%blackout parent%'
      OR regexp_replace(lower(concat_ws(' ', u.username, u.first_name, u.last_name)), '[^a-z0-9]+', ' ', 'g') LIKE '%parent guide%'
    )
),
target_children AS (
  SELECT DISTINCT c.id AS child_id, c.user_id AS child_user_id
  FROM children c
  JOIN parent_children pc ON pc.child_id = c.id
  JOIN target_parents tp ON tp.parent_id = pc.parent_id
  WHERE c.deleted_at IS NULL
    AND c.is_active = true
),
target_orders AS (
  SELECT DISTINCT o.id
  FROM orders o
  LEFT JOIN billing_records br ON br.order_id = o.id
  WHERE o.child_id IN (SELECT child_id FROM target_children)
     OR br.parent_id IN (SELECT parent_id FROM target_parents)
),
deleted_receipts AS (
  DELETE FROM digital_receipts dr
  USING billing_records br, target_orders t
  WHERE dr.billing_record_id = br.id
    AND br.order_id = t.id
  RETURNING dr.id
),
deleted_order_mutations AS (
  DELETE FROM order_mutations om
  USING target_orders t
  WHERE om.order_id = t.id
  RETURNING om.id
),
deleted_billing AS (
  DELETE FROM billing_records br
  USING target_orders t
  WHERE br.order_id = t.id
  RETURNING br.id
),
deleted_delivery_assignments AS (
  DELETE FROM delivery_assignments da
  USING target_orders t
  WHERE da.order_id = t.id
  RETURNING da.id
),
deleted_order_items AS (
  DELETE FROM order_items oi
  USING target_orders t
  WHERE oi.order_id = t.id
  RETURNING oi.id
),
deleted_orders AS (
  DELETE FROM orders o
  USING target_orders t
  WHERE o.id = t.id
  RETURNING o.id
),
deleted_cart_items AS (
  DELETE FROM cart_items ci
  USING order_carts oc, target_children tc
  WHERE ci.cart_id = oc.id
    AND oc.child_id = tc.child_id
  RETURNING ci.id
),
deleted_order_carts AS (
  DELETE FROM order_carts oc
  USING target_children tc
  WHERE oc.child_id = tc.child_id
  RETURNING oc.id
),
deleted_favourites AS (
  DELETE FROM favourite_meals fm
  WHERE fm.created_by_user_id IN (
      SELECT parent_user_id FROM target_parents
      UNION
      SELECT child_user_id FROM target_children
    )
    OR fm.child_id IN (SELECT child_id FROM target_children)
  RETURNING fm.id
),
deleted_child_restrictions AS (
  DELETE FROM child_dietary_restrictions cdr
  USING target_children tc
  WHERE cdr.child_id = tc.child_id
  RETURNING cdr.id
),
deleted_child_badges AS (
  DELETE FROM child_badges cb
  USING target_children tc
  WHERE cb.child_id = tc.child_id
  RETURNING cb.id
),
deleted_parent_children AS (
  DELETE FROM parent_children pc
  WHERE pc.parent_id IN (SELECT parent_id FROM target_parents)
     OR pc.child_id IN (SELECT child_id FROM target_children)
  RETURNING pc.id
),
deleted_user_preferences AS (
  DELETE FROM user_preferences up
  WHERE up.user_id IN (
    SELECT parent_user_id FROM target_parents
    UNION
    SELECT child_user_id FROM target_children
  )
  RETURNING up.id
),
soft_deleted_children AS (
  UPDATE children c
  SET is_active = false,
      deleted_at = now(),
      updated_at = now()
  WHERE c.id IN (SELECT child_id FROM target_children)
  RETURNING c.id
),
soft_deleted_child_users AS (
  UPDATE users u
  SET is_active = false,
      deleted_at = now(),
      updated_at = now()
  WHERE u.id IN (SELECT child_user_id FROM target_children)
  RETURNING u.id
),
soft_deleted_parents AS (
  UPDATE parents p
  SET deleted_at = now(),
      updated_at = now()
  WHERE p.id IN (SELECT parent_id FROM target_parents)
  RETURNING p.id
),
soft_deleted_parent_users AS (
  UPDATE users u
  SET is_active = false,
      deleted_at = now(),
      updated_at = now()
  WHERE u.id IN (SELECT parent_user_id FROM target_parents)
  RETURNING u.id
)
SELECT json_build_object(
  'target_parent_count', (SELECT count(*) FROM target_parents),
  'target_child_count', (SELECT count(*) FROM target_children),
  'orders_deleted', (SELECT count(*) FROM deleted_orders),
  'billing_deleted', (SELECT count(*) FROM deleted_billing),
  'delivery_assignments_deleted', (SELECT count(*) FROM deleted_delivery_assignments),
  'order_items_deleted', (SELECT count(*) FROM deleted_order_items),
  'order_mutations_deleted', (SELECT count(*) FROM deleted_order_mutations),
  'digital_receipts_deleted', (SELECT count(*) FROM deleted_receipts),
  'order_carts_deleted', (SELECT count(*) FROM deleted_order_carts),
  'cart_items_deleted', (SELECT count(*) FROM deleted_cart_items),
  'favourite_meals_deleted', (SELECT count(*) FROM deleted_favourites),
  'child_dietary_restrictions_deleted', (SELECT count(*) FROM deleted_child_restrictions),
  'child_badges_deleted', (SELECT count(*) FROM deleted_child_badges),
  'parent_children_deleted', (SELECT count(*) FROM deleted_parent_children),
  'user_preferences_deleted', (SELECT count(*) FROM deleted_user_preferences),
  'parents_soft_deleted', (SELECT count(*) FROM soft_deleted_parents),
  'parent_users_soft_deleted', (SELECT count(*) FROM soft_deleted_parent_users),
  'children_soft_deleted', (SELECT count(*) FROM soft_deleted_children),
  'child_users_soft_deleted', (SELECT count(*) FROM soft_deleted_child_users)
) AS cleanup_summary;

COMMIT;
SQL
