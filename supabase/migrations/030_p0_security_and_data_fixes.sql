-- ============================================================================
-- Migration 030: P0 security/data fixes after audit
-- ============================================================================
-- 1. Repair invalid legacy order times before any backfill.
-- 2. Safely apply missing order time columns from migration 029.
-- 3. Restore operational columns required by UI/runtime:
--    - orders.is_locked
--    - work_schedules.is_night_shift
-- ============================================================================

-- 1. Repair broken records where end < start
UPDATE orders
SET scheduled_time_end = (scheduled_time_start + interval '60 minutes')::time
WHERE scheduled_time_start IS NOT NULL
  AND scheduled_time_end IS NOT NULL
  AND scheduled_time_end < scheduled_time_start;

-- 2. Missing operational columns
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE work_schedules
  ADD COLUMN IF NOT EXISTS is_night_shift BOOLEAN NOT NULL DEFAULT false;

-- 3. Extended order time model from migration 029
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_time_type TEXT DEFAULT 'fixed';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_order_time_type_check'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_order_time_type_check
      CHECK (order_time_type IN ('immediate', 'fixed', 'window', 'flexible'));
  END IF;
END $$;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS min_arrival_time TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS max_arrival_time TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS planned_start_time TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_duration_minutes INTEGER DEFAULT 60;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS planned_end_time TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS actual_departure_time TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS actual_start_time TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS actual_end_time TIMESTAMPTZ;

-- 4. Backfill new time columns from legacy schedule fields
UPDATE orders
SET
  min_arrival_time = COALESCE(
    min_arrival_time,
    (scheduled_date::text || ' ' || scheduled_time_start::text)::timestamp AT TIME ZONE 'Europe/Warsaw'
  ),
  max_arrival_time = COALESCE(
    max_arrival_time,
    (scheduled_date::text || ' ' || scheduled_time_end::text)::timestamp AT TIME ZONE 'Europe/Warsaw'
  ),
  planned_start_time = COALESCE(
    planned_start_time,
    (scheduled_date::text || ' ' || scheduled_time_start::text)::timestamp AT TIME ZONE 'Europe/Warsaw'
  ),
  service_duration_minutes = COALESCE(
    NULLIF(service_duration_minutes, 0),
    GREATEST(
      1,
      COALESCE(
        (EXTRACT(EPOCH FROM (scheduled_time_end - scheduled_time_start)) / 60)::integer,
        60
      )
    )
  ),
  order_time_type = COALESCE(
    order_time_type,
    CASE
      WHEN scheduled_time_start = scheduled_time_end THEN 'immediate'
      WHEN time_window IS NOT NULL THEN 'window'
      ELSE 'fixed'
    END
  )
WHERE scheduled_date IS NOT NULL
  AND scheduled_time_start IS NOT NULL
  AND scheduled_time_end IS NOT NULL;

UPDATE orders
SET planned_end_time = planned_start_time + (service_duration_minutes * interval '1 minute')
WHERE planned_start_time IS NOT NULL
  AND service_duration_minutes IS NOT NULL
  AND planned_end_time IS NULL;

-- 5. Trigger to keep planned_end_time in sync
CREATE OR REPLACE FUNCTION compute_order_planned_end() RETURNS trigger AS $$
BEGIN
  IF NEW.planned_start_time IS NOT NULL AND NEW.service_duration_minutes IS NOT NULL THEN
    NEW.planned_end_time := NEW.planned_start_time + (NEW.service_duration_minutes * interval '1 minute');
  ELSE
    NEW.planned_end_time := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_compute_order_planned_end'
  ) THEN
    CREATE TRIGGER trg_compute_order_planned_end
      BEFORE INSERT OR UPDATE OF planned_start_time, service_duration_minutes ON orders
      FOR EACH ROW EXECUTE FUNCTION compute_order_planned_end();
  END IF;
END $$;

-- 6. Supporting indexes
CREATE INDEX IF NOT EXISTS idx_orders_planned_start ON orders(planned_start_time);
CREATE INDEX IF NOT EXISTS idx_orders_min_arrival ON orders(min_arrival_time);
CREATE INDEX IF NOT EXISTS idx_orders_time_type ON orders(order_time_type);
