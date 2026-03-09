-- Pre-production cleanup:
-- Delete seeded transactional data before 2025-03-09 for:
-- 1) Orders
-- 2) Billing (paid/unpaid/rejected/pending)
-- 3) Delivery assignments
--
-- Run with:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/cleanup_seed_data_before_2025_03_09.sql

BEGIN;

WITH target_orders AS (
  SELECT o.id
  FROM orders o
  WHERE o.service_date < DATE '2025-03-09'
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
)
SELECT json_build_object(
  'cutoff_before_date', '2025-03-09',
  'orders_deleted', (SELECT count(*) FROM deleted_orders),
  'billing_records_deleted', (SELECT count(*) FROM deleted_billing),
  'delivery_assignments_deleted', (SELECT count(*) FROM deleted_delivery_assignments),
  'order_items_deleted', (SELECT count(*) FROM deleted_order_items),
  'order_mutations_deleted', (SELECT count(*) FROM deleted_order_mutations),
  'digital_receipts_deleted', (SELECT count(*) FROM deleted_receipts)
) AS cleanup_summary;

COMMIT;
