BEGIN;

-- ============================================================
-- BASE FACT VIEW  (core of all analytics)
-- Updated: children.school_id → schools.name join
-- ============================================================
DROP VIEW IF EXISTS vw_order_facts CASCADE;
CREATE VIEW vw_order_facts AS
SELECT
  o.id                                          AS order_id,
  o.order_number,
  o.service_date,
  to_char(o.service_date, 'Dy')                AS service_day_name,
  EXTRACT(isodow  FROM o.service_date)::int    AS service_day_of_week,
  EXTRACT(week    FROM o.service_date)::int    AS service_week,
  EXTRACT(month   FROM o.service_date)::int    AS service_month,
  EXTRACT(year    FROM o.service_date)::int    AS service_year,
  o.session,
  o.status                                      AS order_status,
  o.delivery_status,
  o.total_price                                 AS order_total_price,
  o.placed_at,
  o.delivered_at,
  c.id                                          AS child_id,
  cu.first_name                                 AS child_first_name,
  cu.last_name                                  AS child_last_name,
  sc.id                                         AS school_id,
  sc.name                                       AS school_name,
  c.school_grade,
  c.gender,
  -- age derived from date_of_birth for analytics
  DATE_PART('year', AGE(o.service_date, c.date_of_birth))::int AS child_age_at_service,
  p.id                                          AS parent_id,
  pu.first_name                                 AS parent_first_name,
  pu.last_name                                  AS parent_last_name,
  br.id                                         AS billing_record_id,
  br.status                                     AS payment_status,
  br.delivery_status                            AS billing_delivery_status,
  br.proof_uploaded_at,
  br.verified_at,
  oi.id                                         AS order_item_id,
  oi.menu_item_id,
  oi.item_name_snapshot                         AS meal_name,
  oi.price_snapshot,
  oi.quantity,
  (oi.price_snapshot * oi.quantity)::numeric(12,2) AS line_total
FROM orders o
JOIN children c    ON c.id       = o.child_id
JOIN users cu      ON cu.id      = c.user_id
JOIN schools sc    ON sc.id      = c.school_id
LEFT JOIN LATERAL (
  SELECT pc.parent_id
  FROM parent_children pc
  WHERE pc.child_id = c.id
  ORDER BY pc.created_at ASC
  LIMIT 1
) pc1 ON true
LEFT JOIN parents p     ON p.id    = pc1.parent_id
LEFT JOIN users pu      ON pu.id   = p.user_id
LEFT JOIN billing_records br ON br.order_id = o.id
LEFT JOIN order_items oi    ON oi.order_id  = o.id
WHERE o.deleted_at IS NULL;

-- ============================================================
-- KITCHEN: daily summary by meal item
-- ============================================================
DROP VIEW IF EXISTS vw_kitchen_summary_daily CASCADE;
CREATE VIEW vw_kitchen_summary_daily AS
SELECT
  f.service_date,
  f.session,
  f.meal_name,
  SUM(f.quantity)::bigint          AS total_qty,
  SUM(f.line_total)::numeric(14,2) AS total_revenue_snapshot
FROM vw_order_facts f
WHERE f.order_status <> 'CANCELLED'
GROUP BY f.service_date, f.session, f.meal_name;

-- ============================================================
-- KITCHEN: summary by session/day
-- ============================================================
DROP VIEW IF EXISTS vw_kitchen_summary_session CASCADE;
CREATE VIEW vw_kitchen_summary_session AS
SELECT
  f.service_date,
  f.session,
  COUNT(DISTINCT f.order_id)::bigint AS total_orders,
  SUM(f.quantity)::bigint            AS total_items,
  SUM(f.line_total)::numeric(14,2)   AS total_revenue_snapshot
FROM vw_order_facts f
WHERE f.order_status <> 'CANCELLED'
GROUP BY f.service_date, f.session;

-- ============================================================
-- KITCHEN: allergen alert view
-- Shows orders where child has dietary restrictions AND
-- the order contains allergen-flagged ingredients
-- ============================================================
DROP VIEW IF EXISTS vw_kitchen_allergen_alerts CASCADE;
CREATE VIEW vw_kitchen_allergen_alerts AS
SELECT DISTINCT
  o.service_date,
  o.session,
  o.id                                                        AS order_id,
  o.order_number,
  c.id                                                        AS child_id,
  concat_ws(' ', cu.first_name, cu.last_name)                AS child_name,
  sc.name                                                     AS school_name,
  c.school_grade,
  cdr.restriction_label,
  cdr.restriction_details,
  i.name                                                      AS flagged_ingredient,
  i.allergen_flag,
  mi.name                                                     AS menu_item_name
FROM orders o
JOIN children c    ON c.id  = o.child_id
JOIN users cu      ON cu.id = c.user_id
JOIN schools sc    ON sc.id = c.school_id
JOIN child_dietary_restrictions cdr
  ON cdr.child_id = c.id AND cdr.is_active = true AND cdr.deleted_at IS NULL
JOIN order_items oi    ON oi.order_id     = o.id
JOIN menu_items mi     ON mi.id           = oi.menu_item_id
JOIN menu_item_ingredients mii ON mii.menu_item_id = mi.id
JOIN ingredients i     ON i.id            = mii.ingredient_id AND i.allergen_flag = true
WHERE o.deleted_at IS NULL
  AND o.status <> 'CANCELLED';

-- ============================================================
-- ADMIN SLICE: parent
-- ============================================================
DROP VIEW IF EXISTS vw_admin_slice_parent CASCADE;
CREATE VIEW vw_admin_slice_parent AS
SELECT
  f.parent_id,
  concat_ws(' ', f.parent_first_name, f.parent_last_name) AS parent_name,
  COUNT(DISTINCT f.order_id)::bigint                       AS total_orders,
  COUNT(DISTINCT f.child_id)::bigint                       AS total_children,
  SUM(f.quantity)::bigint                                  AS total_items,
  SUM(f.line_total)::numeric(14,2)                         AS total_revenue_snapshot
FROM vw_order_facts f
WHERE f.order_status <> 'CANCELLED'
GROUP BY f.parent_id, f.parent_first_name, f.parent_last_name;

-- ============================================================
-- ADMIN SLICE: child (with school from FK)
-- ============================================================
DROP VIEW IF EXISTS vw_admin_slice_child CASCADE;
CREATE VIEW vw_admin_slice_child AS
SELECT
  f.child_id,
  concat_ws(' ', f.child_first_name, f.child_last_name) AS child_name,
  f.school_name,
  f.school_grade,
  f.gender,
  f.child_age_at_service,
  COUNT(DISTINCT f.order_id)::bigint                     AS total_orders,
  SUM(f.quantity)::bigint                                AS total_items,
  SUM(f.line_total)::numeric(14,2)                       AS total_revenue_snapshot
FROM vw_order_facts f
WHERE f.order_status <> 'CANCELLED'
GROUP BY f.child_id, f.child_first_name, f.child_last_name, f.school_name, f.school_grade, f.gender, f.child_age_at_service;

-- ============================================================
-- ADMIN SLICE: meal
-- ============================================================
DROP VIEW IF EXISTS vw_admin_slice_meal CASCADE;
CREATE VIEW vw_admin_slice_meal AS
SELECT
  f.meal_name,
  f.session,
  COUNT(DISTINCT f.order_id)::bigint AS total_orders,
  SUM(f.quantity)::bigint            AS total_qty,
  SUM(f.line_total)::numeric(14,2)   AS total_revenue_snapshot
FROM vw_order_facts f
WHERE f.order_status <> 'CANCELLED'
GROUP BY f.meal_name, f.session;

-- ============================================================
-- ADMIN SLICE: delivery status
-- ============================================================
DROP VIEW IF EXISTS vw_admin_slice_delivery_status CASCADE;
CREATE VIEW vw_admin_slice_delivery_status AS
SELECT
  f.service_date,
  f.delivery_status,
  COUNT(DISTINCT f.order_id)::bigint AS total_orders,
  COUNT(DISTINCT CASE WHEN f.delivery_status = 'DELIVERED' THEN f.order_id END)::bigint AS delivered_orders
FROM vw_order_facts f
GROUP BY f.service_date, f.delivery_status;

-- ============================================================
-- ADMIN SLICE: payment status
-- ============================================================
DROP VIEW IF EXISTS vw_admin_slice_payment_status CASCADE;
CREATE VIEW vw_admin_slice_payment_status AS
SELECT
  f.service_date,
  f.payment_status,
  COUNT(DISTINCT f.order_id)::bigint AS total_orders,
  SUM(f.line_total)::numeric(14,2)   AS total_revenue_snapshot
FROM vw_order_facts f
GROUP BY f.service_date, f.payment_status;

-- ============================================================
-- ADMIN SLICE: session/day/week/month
-- ============================================================
DROP VIEW IF EXISTS vw_admin_slice_time_session CASCADE;
CREATE VIEW vw_admin_slice_time_session AS
SELECT
  f.service_year,
  f.service_month,
  f.service_week,
  f.service_date,
  f.service_day_name,
  f.session,
  COUNT(DISTINCT f.order_id)::bigint AS total_orders,
  SUM(f.quantity)::bigint            AS total_items,
  SUM(f.line_total)::numeric(14,2)   AS total_revenue_snapshot
FROM vw_order_facts f
WHERE f.order_status <> 'CANCELLED'
GROUP BY
  f.service_year, f.service_month, f.service_week,
  f.service_date, f.service_day_name, f.session;

-- ============================================================
-- ADMIN SLICE: by school
-- ============================================================
DROP VIEW IF EXISTS vw_admin_slice_school CASCADE;
CREATE VIEW vw_admin_slice_school AS
SELECT
  f.school_id,
  f.school_name,
  f.service_date,
  f.session,
  COUNT(DISTINCT f.order_id)::bigint AS total_orders,
  COUNT(DISTINCT f.child_id)::bigint AS total_children,
  SUM(f.quantity)::bigint            AS total_items,
  SUM(f.line_total)::numeric(14,2)   AS total_revenue_snapshot
FROM vw_order_facts f
WHERE f.order_status <> 'CANCELLED'
GROUP BY f.school_id, f.school_name, f.service_date, f.session;

-- ============================================================
-- PARENT SPENDING DASHBOARD VIEW
-- ============================================================
DROP VIEW IF EXISTS vw_spending_by_parent CASCADE;
CREATE VIEW vw_spending_by_parent AS
SELECT
  f.parent_id,
  concat_ws(' ', f.parent_first_name, f.parent_last_name) AS parent_name,
  f.child_id,
  concat_ws(' ', f.child_first_name, f.child_last_name)   AS child_name,
  f.service_year  AS year,
  f.service_month AS month,
  f.session,
  COUNT(DISTINCT f.order_id)::bigint                       AS total_orders,
  SUM(f.line_total)::numeric(14,2)                         AS total_spent,
  SUM(CASE WHEN f.payment_status = 'UNPAID'
        THEN f.line_total ELSE 0 END)::numeric(14,2)       AS outstanding_amount
FROM vw_order_facts f
WHERE f.order_status <> 'CANCELLED'
GROUP BY
  f.parent_id, f.parent_first_name, f.parent_last_name,
  f.child_id, f.child_first_name, f.child_last_name,
  f.service_year, f.service_month, f.session;

-- ============================================================
-- PARENT CONSOLIDATED ORDERS VIEW (all linked children)
-- ============================================================
DROP VIEW IF EXISTS vw_parent_consolidated_orders CASCADE;
CREATE VIEW vw_parent_consolidated_orders AS
SELECT
  f.parent_id,
  concat_ws(' ', f.parent_first_name, f.parent_last_name) AS parent_name,
  f.order_id,
  f.order_number,
  f.service_date,
  f.session,
  f.order_status,
  f.delivery_status,
  f.child_id,
  concat_ws(' ', f.child_first_name, f.child_last_name) AS child_name,
  f.school_name,
  SUM(f.quantity)::bigint            AS total_items,
  SUM(f.line_total)::numeric(14,2)   AS order_total
FROM vw_order_facts f
GROUP BY
  f.parent_id, f.parent_first_name, f.parent_last_name,
  f.order_id, f.order_number, f.service_date, f.session,
  f.order_status, f.delivery_status,
  f.child_id, f.child_first_name, f.child_last_name, f.school_name;

-- ============================================================
-- PARENT CONSOLIDATED BILLING VIEW (all linked children)
-- ============================================================
DROP VIEW IF EXISTS vw_parent_consolidated_billing CASCADE;
CREATE VIEW vw_parent_consolidated_billing AS
SELECT
  f.parent_id,
  concat_ws(' ', f.parent_first_name, f.parent_last_name) AS parent_name,
  f.billing_record_id,
  f.order_id,
  f.order_number,
  f.service_date,
  f.session,
  f.payment_status,
  f.billing_delivery_status AS delivery_status,
  f.child_id,
  concat_ws(' ', f.child_first_name, f.child_last_name) AS child_name,
  SUM(f.line_total)::numeric(14,2) AS billed_total
FROM vw_order_facts f
WHERE f.billing_record_id IS NOT NULL
GROUP BY
  f.parent_id, f.parent_first_name, f.parent_last_name,
  f.billing_record_id, f.order_id, f.order_number,
  f.service_date, f.session, f.payment_status, f.billing_delivery_status,
  f.child_id, f.child_first_name, f.child_last_name;

-- ============================================================
-- ADMIN REVENUE DASHBOARD VIEW
-- ============================================================
DROP VIEW IF EXISTS vw_revenue_summary CASCADE;
CREATE VIEW vw_revenue_summary AS
SELECT
  f.service_year          AS year,
  f.service_month         AS month,
  f.service_week          AS week,
  f.service_date,
  f.session,
  f.school_name,
  f.payment_status,
  f.delivery_status,
  COUNT(DISTINCT f.order_id)::bigint  AS total_orders,
  SUM(f.quantity)::bigint             AS total_items,
  SUM(f.line_total)::numeric(14,2)    AS total_revenue,
  SUM(CASE WHEN f.payment_status = 'UNPAID'
        THEN f.line_total ELSE 0 END)::numeric(14,2) AS outstanding_revenue,
  COUNT(DISTINCT CASE WHEN f.delivery_status = 'DELIVERED' THEN f.order_id END)::bigint AS delivered_orders
FROM vw_order_facts f
WHERE f.order_status <> 'CANCELLED'
GROUP BY
  f.service_year, f.service_month, f.service_week,
  f.service_date, f.session, f.school_name,
  f.payment_status, f.delivery_status;

-- ============================================================
-- CHILD BADGE STREAK HELPER VIEW
-- (used by badge calculation logic to count consecutive weekday orders)
-- ============================================================
DROP VIEW IF EXISTS vw_child_order_days CASCADE;
CREATE VIEW vw_child_order_days AS
SELECT DISTINCT
  o.child_id,
  o.service_date
FROM orders o
WHERE o.status <> 'CANCELLED'
  AND o.deleted_at IS NULL;

-- ============================================================
-- NUTRITIONAL SUMMARY VIEW (per child per week)
-- ============================================================
DROP VIEW IF EXISTS vw_child_nutrition_summary CASCADE;
CREATE VIEW vw_child_nutrition_summary AS
SELECT
  f.child_id,
  concat_ws(' ', f.child_first_name, f.child_last_name) AS child_name,
  f.service_year  AS year,
  f.service_week  AS week,
  f.session,
  COUNT(DISTINCT f.order_id)::bigint   AS total_orders,
  COUNT(DISTINCT f.meal_name)::bigint  AS distinct_meals,
  f.meal_name,
  SUM(f.quantity)::bigint              AS meal_qty
FROM vw_order_facts f
WHERE f.order_status <> 'CANCELLED'
GROUP BY f.child_id, f.child_first_name, f.child_last_name,
         f.service_year, f.service_week, f.session, f.meal_name;

-- ============================================================
-- MATERIALIZED ROLLUP for admin dashboard speed
-- (Updated to include school_id for FK-based grouping)
-- ============================================================
DROP MATERIALIZED VIEW IF EXISTS mv_admin_daily_rollup CASCADE;
CREATE MATERIALIZED VIEW mv_admin_daily_rollup AS
SELECT
  f.service_date,
  f.session,
  f.school_id,
  f.school_name,
  f.gender,
  f.delivery_status,
  f.payment_status,
  COUNT(DISTINCT f.order_id)::bigint  AS total_orders,
  COUNT(DISTINCT f.child_id)::bigint  AS total_children,
  SUM(f.quantity)::bigint             AS total_items,
  SUM(f.line_total)::numeric(14,2)    AS total_revenue_snapshot
FROM vw_order_facts f
WHERE f.order_status <> 'CANCELLED'
GROUP BY
  f.service_date, f.session, f.school_id, f.school_name,
  f.gender, f.delivery_status, f.payment_status;

CREATE UNIQUE INDEX IF NOT EXISTS mv_admin_daily_rollup_uq
  ON mv_admin_daily_rollup (service_date, session, school_id, gender, delivery_status, payment_status);
CREATE INDEX IF NOT EXISTS mv_admin_daily_rollup_service_date_idx
  ON mv_admin_daily_rollup (service_date);
CREATE INDEX IF NOT EXISTS mv_admin_daily_rollup_school_idx
  ON mv_admin_daily_rollup (school_id, service_date);

-- ============================================================
-- FUNCTION: refresh materialized rollup (called by pg_cron every 5 min)
-- ============================================================
CREATE OR REPLACE FUNCTION refresh_mv_admin_daily_rollup()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_admin_daily_rollup;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION: kitchen summary (convenience for API endpoint)
-- ============================================================
CREATE OR REPLACE FUNCTION fn_kitchen_summary(
  p_service_date date,
  p_session      session_type DEFAULT NULL
)
RETURNS TABLE (
  service_date             date,
  session                  session_type,
  meal_name                varchar(150),
  total_qty                bigint,
  total_revenue_snapshot   numeric(14,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.service_date,
    v.session,
    v.meal_name::varchar(150),
    v.total_qty,
    v.total_revenue_snapshot
  FROM vw_kitchen_summary_daily v
  WHERE v.service_date = p_service_date
    AND (p_session IS NULL OR v.session = p_session)
  ORDER BY v.session, v.meal_name;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- FUNCTION: generate receipt number (format: BLC-YYYY-NNNNN)
-- ============================================================
CREATE OR REPLACE FUNCTION generate_receipt_number()
RETURNS varchar(50) AS $$
DECLARE
  seq_val bigint;
  year_str text;
BEGIN
  seq_val  := nextval('receipt_number_seq');
  year_str := to_char(now(), 'YYYY');
  RETURN 'BLC-' || year_str || '-' || lpad(seq_val::text, 5, '0');
END;
$$ LANGUAGE plpgsql;

COMMIT;
