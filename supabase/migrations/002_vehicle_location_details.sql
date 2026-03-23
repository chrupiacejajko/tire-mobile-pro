-- Make employee_id nullable (vehicles can be tracked without an assigned driver)
ALTER TABLE public.employee_locations
  ALTER COLUMN employee_id DROP NOT NULL;

-- Add vehicle tracking detail columns to employee_locations
ALTER TABLE public.employee_locations
  ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS speed INTEGER,
  ADD COLUMN IF NOT EXISTS direction TEXT,
  ADD COLUMN IF NOT EXISTS rpm INTEGER,
  ADD COLUMN IF NOT EXISTS driving_time TEXT;

CREATE INDEX IF NOT EXISTS idx_employee_locations_vehicle ON public.employee_locations(vehicle_id);
