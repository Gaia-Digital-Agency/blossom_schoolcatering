-- ============================================================
-- Cleanup: remove ALL order history for Syrowatka family
-- Scope  : parents where users.last_name ILIKE 'syrowatka'
-- Keeps  : users, parents, children, schools (student data intact)
-- Deletes: orders, order_items, order_mutations, billing_records,
--          digital_receipts, delivery_assignments, open carts.
--
-- Safety : runs in a single transaction. A preview SELECT at the
--          top prints what will be affected. Review output, then
--          change ROLLBACK at the bottom to COMMIT to apply.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- Resolve target parents / children / orders
-- ────────────────────────────────────────────────────────────

CREATE TEMP TABLE _syro_parent_user_ids AS
SELECT u.id AS user_id
FROM users u
WHERE u.role = 'PARENT'
  AND u.last_name ILIKE 'syrowatka';

CREATE TEMP TABLE _syro_parent_ids AS
SELECT p.id AS parent_id
FROM parents p
WHERE p.user_id IN (SELECT user_id FROM _syro_parent_user_ids);

CREATE TEMP TABLE _syro_child_ids AS
SELECT DISTINCT pc.child_id
FROM parent_children pc
WHERE pc.parent_id IN (SELECT parent_id FROM _syro_parent_ids);

CREATE TEMP TABLE _syro_order_ids AS
SELECT id AS order_id
FROM orders
WHERE child_id IN (SELECT child_id FROM _syro_child_ids);

CREATE TEMP TABLE _syro_cart_ids AS
SELECT id AS cart_id
FROM order_carts
WHERE child_id IN (SELECT child_id FROM _syro_child_ids);

-- ────────────────────────────────────────────────────────────
-- Preview counts (prints in psql output)
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  p_count int; c_count int; o_count int; cart_count int;
  br_count int; dr_count int; oi_count int; da_count int; om_count int;
BEGIN
  SELECT count(*) INTO p_count FROM _syro_parent_user_ids;
  SELECT count(*) INTO c_count FROM _syro_child_ids;
  SELECT count(*) INTO o_count FROM _syro_order_ids;
  SELECT count(*) INTO cart_count FROM _syro_cart_ids;
  SELECT count(*) INTO br_count FROM billing_records
    WHERE order_id IN (SELECT order_id FROM _syro_order_ids);
  SELECT count(*) INTO dr_count FROM digital_receipts
    WHERE billing_record_id IN (SELECT id FROM billing_records
      WHERE order_id IN (SELECT order_id FROM _syro_order_ids));
  SELECT count(*) INTO oi_count FROM order_items
    WHERE order_id IN (SELECT order_id FROM _syro_order_ids);
  SELECT count(*) INTO da_count FROM delivery_assignments
    WHERE order_id IN (SELECT order_id FROM _syro_order_ids);
  SELECT count(*) INTO om_count FROM order_mutations
    WHERE order_id IN (SELECT order_id FROM _syro_order_ids);

  RAISE NOTICE '── Syrowatka cleanup preview ──';
  RAISE NOTICE 'Parents matched      : %', p_count;
  RAISE NOTICE 'Children matched     : %', c_count;
  RAISE NOTICE 'Orders to delete     : %', o_count;
  RAISE NOTICE 'Order items          : %', oi_count;
  RAISE NOTICE 'Order mutations      : %', om_count;
  RAISE NOTICE 'Billing records      : %', br_count;
  RAISE NOTICE 'Digital receipts     : %', dr_count;
  RAISE NOTICE 'Delivery assignments : %', da_count;
  RAISE NOTICE 'Open/submitted carts : %', cart_count;
END$$;

-- ────────────────────────────────────────────────────────────
-- Delete in FK-safe order
-- ────────────────────────────────────────────────────────────

DELETE FROM digital_receipts
WHERE billing_record_id IN (
  SELECT id FROM billing_records
  WHERE order_id IN (SELECT order_id FROM _syro_order_ids)
);

DELETE FROM delivery_assignments
WHERE order_id IN (SELECT order_id FROM _syro_order_ids);

DELETE FROM billing_records
WHERE order_id IN (SELECT order_id FROM _syro_order_ids);

DELETE FROM order_mutations
WHERE order_id IN (SELECT order_id FROM _syro_order_ids);

DELETE FROM order_items
WHERE order_id IN (SELECT order_id FROM _syro_order_ids);

DELETE FROM orders
WHERE id IN (SELECT order_id FROM _syro_order_ids);

-- Clear any leftover carts so children can start fresh
DELETE FROM cart_items
WHERE cart_id IN (SELECT cart_id FROM _syro_cart_ids);

DELETE FROM order_carts
WHERE id IN (SELECT cart_id FROM _syro_cart_ids);

-- ────────────────────────────────────────────────────────────
-- Drop temp tables
-- ────────────────────────────────────────────────────────────
DROP TABLE _syro_parent_user_ids;
DROP TABLE _syro_parent_ids;
DROP TABLE _syro_child_ids;
DROP TABLE _syro_order_ids;
DROP TABLE _syro_cart_ids;

-- Change to COMMIT to apply. Leave as ROLLBACK for dry-run.
ROLLBACK;
