-- 023: Extended fleet telemetry from Satis GPS REST API
-- Adds fuel, odometer, voltage, ignition fields to employee_locations
-- Adds satis_device_id mapping to vehicles
-- Creates vehicle_telemetry_snapshots for daily fleet reports

-- ── Extend employee_locations with full telemetry ──────────────────────────
ALTER TABLE public.employee_locations
  ADD COLUMN IF NOT EXISTS fuel_liters      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS fuel_percent     INTEGER,
  ADD COLUMN IF NOT EXISTS odometer_km      INTEGER,
  ADD COLUMN IF NOT EXISTS voltage          DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS engine_on        BOOLEAN,
  ADD COLUMN IF NOT EXISTS heading          INTEGER,
  ADD COLUMN IF NOT EXISTS satis_device_id  TEXT,
  ADD COLUMN IF NOT EXISTS total_fuel_used  DOUBLE PRECISION;

-- ── Ensure all vehicles have satis_device_id for matching ──────────────────
-- (Some already have it, fill in the rest)
DO $$
BEGIN
  -- ZS281PW = DeviceID 72044
  UPDATE public.vehicles SET satis_device_id = '72044' WHERE plate_number = 'ZS281PW' AND (satis_device_id IS NULL OR satis_device_id = '');
  -- ZS700ME = DeviceID 75647
  UPDATE public.vehicles SET satis_device_id = '75647' WHERE plate_number = 'ZS700ME' AND (satis_device_id IS NULL OR satis_device_id = '');
  -- ZS821SK = DeviceID 79156
  UPDATE public.vehicles SET satis_device_id = '79156' WHERE plate_number = 'ZS821SK' AND (satis_device_id IS NULL OR satis_device_id = '');
  -- ZS737TJ = DeviceID 88661
  UPDATE public.vehicles SET satis_device_id = '88661' WHERE plate_number = 'ZS737TJ' AND (satis_device_id IS NULL OR satis_device_id = '');
  -- ZS397TN = DeviceID 89128
  UPDATE public.vehicles SET satis_device_id = '89128' WHERE plate_number = 'ZS397TN' AND (satis_device_id IS NULL OR satis_device_id = '');
  -- PY4836H = DeviceID 92382
  UPDATE public.vehicles SET satis_device_id = '92382' WHERE plate_number = 'PY4836H' AND (satis_device_id IS NULL OR satis_device_id = '');
  -- ZS365UX = DeviceID 95277
  UPDATE public.vehicles SET satis_device_id = '95277' WHERE plate_number = 'ZS365UX' AND (satis_device_id IS NULL OR satis_device_id = '');
END $$;

-- ── Daily fleet snapshots for trend tracking ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.vehicle_daily_stats (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id      UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  odometer_start  INTEGER,
  odometer_end    INTEGER,
  km_driven       INTEGER GENERATED ALWAYS AS (COALESCE(odometer_end, 0) - COALESCE(odometer_start, 0)) STORED,
  fuel_used       DOUBLE PRECISION,
  avg_fuel_consumption DOUBLE PRECISION,  -- L/100km
  max_speed       INTEGER,
  engine_hours    DOUBLE PRECISION,       -- hours engine was on
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(vehicle_id, date)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_vehicle_daily_stats_date ON public.vehicle_daily_stats(date DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_daily_stats_vehicle ON public.vehicle_daily_stats(vehicle_id, date DESC);

-- Index on employee_locations for telemetry queries
CREATE INDEX IF NOT EXISTS idx_employee_locations_vehicle_ts
  ON public.employee_locations(vehicle_id, timestamp DESC)
  WHERE vehicle_id IS NOT NULL;
