-- Performance indexes for menu and order date/status filters.
-- Run once in production.

CREATE INDEX IF NOT EXISTS menus_service_date_published_idx
  ON menus (service_date, is_published)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS orders_active_date_status_idx
  ON orders (service_date, status)
  WHERE deleted_at IS NULL;
