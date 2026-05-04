-- ============================================================
-- Cleanup: family01 .. family05 — full purge
-- Targets parents whose username matches 'family0[1-5]_parent%'
-- Deletes: every linked child, every order/billing/cart/etc
--          for those children, then the parent records and the
--          underlying user accounts.
--
-- Safety : single transaction. Preview NOTICE prints affected
--          row counts. Ends in ROLLBACK by default; flip to COMMIT
--          to apply.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- Resolve target parents → children → orders → carts
-- ────────────────────────────────────────────────────────────

CREATE TEMP TABLE _fam_parent_user_ids AS
SELECT u.id AS user_id
FROM users u
WHERE u.role = 'PARENT'
  AND u.username ~* '^family0[1-5]_parent[0-9]+$';

CREATE TEMP TABLE _fam_parent_ids AS
SELECT p.id AS parent_id
FROM parents p
WHERE p.user_id IN (SELECT user_id FROM _fam_parent_user_ids);

CREATE TEMP TABLE _fam_child_ids AS
SELECT DISTINCT pc.child_id
FROM parent_children pc
WHERE pc.parent_id IN (SELECT parent_id FROM _fam_parent_ids);

CREATE TEMP TABLE _fam_child_user_ids AS
SELECT c.user_id
FROM children c
WHERE c.id IN (SELECT child_id FROM _fam_child_ids);

CREATE TEMP TABLE _fam_order_ids AS
SELECT id AS order_id
FROM orders
WHERE child_id IN (SELECT child_id FROM _fam_child_ids);

CREATE TEMP TABLE _fam_cart_ids AS
SELECT id AS cart_id
FROM order_carts
WHERE child_id IN (SELECT child_id FROM _fam_child_ids);

-- ────────────────────────────────────────────────────────────
-- Preview counts
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  p_count int; c_count int; o_count int; cart_count int;
  br_count int; dr_count int; oi_count int; da_count int; om_count int;
  ci_count int;
BEGIN
  SELECT count(*) INTO p_count FROM _fam_parent_user_ids;
  SELECT count(*) INTO c_count FROM _fam_child_ids;
  SELECT count(*) INTO o_count FROM _fam_order_ids;
  SELECT count(*) INTO cart_count FROM _fam_cart_ids;
  SELECT count(*) INTO br_count FROM billing_records
    WHERE order_id IN (SELECT order_id FROM _fam_order_ids);
  SELECT count(*) INTO dr_count FROM digital_receipts
    WHERE billing_record_id IN (SELECT id FROM billing_records
      WHERE order_id IN (SELECT order_id FROM _fam_order_ids));
  SELECT count(*) INTO oi_count FROM order_items
    WHERE order_id IN (SELECT order_id FROM _fam_order_ids);
  SELECT count(*) INTO da_count FROM delivery_assignments
    WHERE order_id IN (SELECT order_id FROM _fam_order_ids);
  SELECT count(*) INTO om_count FROM order_mutations
    WHERE order_id IN (SELECT order_id FROM _fam_order_ids);
  SELECT count(*) INTO ci_count FROM cart_items
    WHERE cart_id IN (SELECT cart_id FROM _fam_cart_ids);

  RAISE NOTICE '── family01..05 cleanup preview ──';
  RAISE NOTICE 'Parents matched      : %', p_count;
  RAISE NOTICE 'Children matched     : %', c_count;
  RAISE NOTICE 'Orders to delete     : %', o_count;
  RAISE NOTICE 'Order items          : %', oi_count;
  RAISE NOTICE 'Order mutations      : %', om_count;
  RAISE NOTICE 'Billing records      : %', br_count;
  RAISE NOTICE 'Digital receipts     : %', dr_count;
  RAISE NOTICE 'Delivery assignments : %', da_count;
  RAISE NOTICE 'Carts                : %', cart_count;
  RAISE NOTICE 'Cart items           : %', ci_count;
END$$;

-- ────────────────────────────────────────────────────────────
-- Orders + billing + delivery + mutations cleanup
-- ────────────────────────────────────────────────────────────

DELETE FROM digital_receipts
WHERE billing_record_id IN (
  SELECT id FROM billing_records
  WHERE order_id IN (SELECT order_id FROM _fam_order_ids)
);

DELETE FROM delivery_assignments
WHERE order_id IN (SELECT order_id FROM _fam_order_ids);

DELETE FROM billing_records
WHERE order_id IN (SELECT order_id FROM _fam_order_ids);

DELETE FROM order_mutations
WHERE order_id IN (SELECT order_id FROM _fam_order_ids);

DELETE FROM order_items
WHERE order_id IN (SELECT order_id FROM _fam_order_ids);

DELETE FROM orders
WHERE id IN (SELECT order_id FROM _fam_order_ids);

-- ────────────────────────────────────────────────────────────
-- Carts cleanup
-- ────────────────────────────────────────────────────────────

DELETE FROM cart_items
WHERE cart_id IN (SELECT cart_id FROM _fam_cart_ids);

DELETE FROM order_carts
WHERE id IN (SELECT cart_id FROM _fam_cart_ids);

-- ────────────────────────────────────────────────────────────
-- Children profile data cleanup
-- ────────────────────────────────────────────────────────────

DELETE FROM child_badges
WHERE child_id IN (SELECT child_id FROM _fam_child_ids);

DELETE FROM child_dietary_restrictions
WHERE child_id IN (SELECT child_id FROM _fam_child_ids);

DELETE FROM favourite_meal_items
WHERE favourite_meal_id IN (
  SELECT id FROM favourite_meals
  WHERE child_id IN (SELECT child_id FROM _fam_child_ids)
);

DELETE FROM favourite_meals
WHERE child_id IN (SELECT child_id FROM _fam_child_ids);

DELETE FROM menu_item_ratings
WHERE user_id IN (SELECT user_id FROM _fam_child_user_ids);

-- ────────────────────────────────────────────────────────────
-- Unlink children from parents, then delete children
-- ────────────────────────────────────────────────────────────

DELETE FROM parent_children
WHERE child_id IN (SELECT child_id FROM _fam_child_ids);

DELETE FROM children
WHERE id IN (SELECT child_id FROM _fam_child_ids);

-- ────────────────────────────────────────────────────────────
-- Child user accounts
-- ────────────────────────────────────────────────────────────

DELETE FROM auth_refresh_sessions
WHERE user_id IN (SELECT user_id FROM _fam_child_user_ids);

DELETE FROM user_identities
WHERE user_id IN (SELECT user_id FROM _fam_child_user_ids);

DELETE FROM user_preferences
WHERE user_id IN (SELECT user_id FROM _fam_child_user_ids);

DELETE FROM users
WHERE id IN (SELECT user_id FROM _fam_child_user_ids);

-- ────────────────────────────────────────────────────────────
-- Parent profile data cleanup
-- ────────────────────────────────────────────────────────────

DELETE FROM parent_dietary_restrictions
WHERE parent_id IN (SELECT parent_id FROM _fam_parent_ids);

DELETE FROM parent_children
WHERE parent_id IN (SELECT parent_id FROM _fam_parent_ids);

DELETE FROM parents
WHERE id IN (SELECT parent_id FROM _fam_parent_ids);

-- ────────────────────────────────────────────────────────────
-- Parent user accounts
-- ────────────────────────────────────────────────────────────

DELETE FROM auth_refresh_sessions
WHERE user_id IN (SELECT user_id FROM _fam_parent_user_ids);

DELETE FROM user_identities
WHERE user_id IN (SELECT user_id FROM _fam_parent_user_ids);

DELETE FROM user_preferences
WHERE user_id IN (SELECT user_id FROM _fam_parent_user_ids);

DELETE FROM users
WHERE id IN (SELECT user_id FROM _fam_parent_user_ids);

-- ────────────────────────────────────────────────────────────
DROP TABLE _fam_parent_user_ids;
DROP TABLE _fam_parent_ids;
DROP TABLE _fam_child_ids;
DROP TABLE _fam_child_user_ids;
DROP TABLE _fam_order_ids;
DROP TABLE _fam_cart_ids;

-- Change to COMMIT to apply. Leave as ROLLBACK for dry-run.
ROLLBACK;
