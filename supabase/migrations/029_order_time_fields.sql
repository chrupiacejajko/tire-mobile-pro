-- ============================================================================
-- Migration 029: Extended order time fields + service categories
-- ============================================================================
-- New time model for orders:
--   min_arrival_time  — earliest arrival (immutable after creation)
--   max_arrival_time  — latest arrival promised to client (immutable)
--   planned_start_time — current planned start (mutable, shifts when rescheduled)
--   service_duration_minutes — from service definition
--   planned_end_time — computed: planned_start_time + service_duration_minutes
--   actual_departure_time — when driver clicked "leaving for order"
--   actual_start_time — when driver clicked "starting work"
--   actual_end_time — when driver clicked "finished"
--   order_time_type — immediate/fixed/window/flexible
-- ============================================================================

-- 1. Add new time columns to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_time_type TEXT DEFAULT 'fixed'
  CHECK (order_time_type IN ('immediate', 'fixed', 'window', 'flexible'));

ALTER TABLE orders ADD COLUMN IF NOT EXISTS min_arrival_time TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS max_arrival_time TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS planned_start_time TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_duration_minutes INTEGER DEFAULT 60;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS planned_end_time TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS actual_departure_time TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS actual_start_time TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS actual_end_time TIMESTAMPTZ;

-- 2. Backfill from existing scheduled_time_start/end
UPDATE orders
SET
  min_arrival_time = (scheduled_date::text || ' ' || scheduled_time_start::text)::timestamp AT TIME ZONE 'Europe/Warsaw',
  max_arrival_time = (scheduled_date::text || ' ' || scheduled_time_end::text)::timestamp AT TIME ZONE 'Europe/Warsaw',
  planned_start_time = (scheduled_date::text || ' ' || scheduled_time_start::text)::timestamp AT TIME ZONE 'Europe/Warsaw',
  service_duration_minutes = COALESCE(
    EXTRACT(EPOCH FROM (scheduled_time_end - scheduled_time_start)) / 60,
    60
  )::integer,
  order_time_type = CASE
    WHEN scheduled_time_start = scheduled_time_end THEN 'immediate'
    ELSE 'fixed'
  END
WHERE min_arrival_time IS NULL;

-- 3. Compute planned_end_time for backfilled rows
UPDATE orders
SET planned_end_time = planned_start_time + (service_duration_minutes * interval '1 minute')
WHERE planned_end_time IS NULL AND planned_start_time IS NOT NULL;

-- 4. Trigger to auto-compute planned_end_time
CREATE OR REPLACE FUNCTION compute_order_planned_end() RETURNS trigger AS $$
BEGIN
  IF NEW.planned_start_time IS NOT NULL AND NEW.service_duration_minutes IS NOT NULL THEN
    NEW.planned_end_time := NEW.planned_start_time + (NEW.service_duration_minutes * interval '1 minute');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_compute_order_planned_end ON orders;
CREATE TRIGGER trg_compute_order_planned_end
  BEFORE INSERT OR UPDATE OF planned_start_time, service_duration_minutes ON orders
  FOR EACH ROW EXECUTE FUNCTION compute_order_planned_end();

-- 5. Indexes for time-based queries
CREATE INDEX IF NOT EXISTS idx_orders_planned_start ON orders(planned_start_time);
CREATE INDEX IF NOT EXISTS idx_orders_min_arrival ON orders(min_arrival_time);
CREATE INDEX IF NOT EXISTS idx_orders_time_type ON orders(order_time_type);

-- 6. Fix service categories — only 'main' and 'additional'
-- First update existing data
UPDATE services SET category = 'main' WHERE category NOT IN ('main', 'additional');

-- Add check constraint
ALTER TABLE services DROP CONSTRAINT IF EXISTS services_category_check;
ALTER TABLE services ADD CONSTRAINT services_category_check
  CHECK (category IN ('main', 'additional'));
