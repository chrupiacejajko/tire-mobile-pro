-- ============================================================
-- 020_order_status_consistency.sql
-- Add 'in_transit' status used by tracking UI.
-- Formalise state machine in comments.
-- ============================================================

-- Drop the existing check constraint (name may vary)
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

-- Re-add with in_transit included
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'new',          -- Created, not yet assigned
    'assigned',     -- Worker assigned, not yet started
    'in_progress',  -- Worker actively working on it
    'in_transit',   -- Worker en route to client (optional transition)
    'completed',    -- Done
    'cancelled'     -- Cancelled by admin/dispatcher
  ));

-- State machine (enforced in API handlers, not DB):
-- new        → assigned      (dispatcher assigns worker)
-- assigned   → in_progress   (worker taps "Start")
-- in_progress → in_transit   (optional: worker marks "En route to next")
-- in_progress → completed    (worker completes)
-- in_transit  → completed    (worker completes after transit)
-- any        → cancelled     (admin / dispatcher action)
-- cancelled  → new           (admin re-opens)

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_orders_status
  ON orders(status);

CREATE INDEX IF NOT EXISTS idx_orders_employee_date
  ON orders(employee_id, scheduled_date)
  WHERE employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_scheduled_date
  ON orders(scheduled_date, status);
