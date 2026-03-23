-- Add location address column to employee_locations (human-readable address from Satis GPS tooltip)
ALTER TABLE public.employee_locations
  ADD COLUMN IF NOT EXISTS location_address TEXT;
