-- Performance indexes for delivery queries.
-- Run once in production.

-- delivery_assignments.delivery_user_id is used in WHERE/GROUP BY for every
-- delivery user's assignment lookup but has no index.
CREATE INDEX IF NOT EXISTS delivery_assignments_delivery_user_id_idx
  ON delivery_assignments (delivery_user_id);

-- orders.delivery_status is filtered in autoAssignDeliveriesForDate
-- (WHERE delivery_status = 'OUT_FOR_DELIVERY') with no index.
-- Combined with service_date since both appear together in the hot query.
CREATE INDEX IF NOT EXISTS orders_service_date_delivery_status_idx
  ON orders (service_date, delivery_status)
  WHERE deleted_at IS NULL;
