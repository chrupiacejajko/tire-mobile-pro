-- Add polygon geometry to regions (stored as JSON array of [lat,lng] pairs)
ALTER TABLE public.regions ADD COLUMN IF NOT EXISTS polygon JSONB;
-- Example: [[52.1, 14.5], [52.2, 14.6], [52.15, 14.7], [52.1, 14.5]]

-- orders already has region_id from initial schema (001), so no change needed
