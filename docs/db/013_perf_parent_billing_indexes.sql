-- Performance indexes for parent-child lookup and billing status filtering.
-- Run once in production.

CREATE INDEX IF NOT EXISTS parent_children_child_id_idx
  ON parent_children (child_id);

CREATE INDEX IF NOT EXISTS billing_records_status_idx
  ON billing_records (status)
  WHERE status IN ('UNPAID', 'PENDING_VERIFICATION');
