-- ============================================================
-- 025: Feedback extensions
-- Adds: service_types, vehicle_types tables
--        new fields on services (vehicle_type_id, required_skill_id)
--        new fields on clients (nip, is_blocked, block_reason)
-- ============================================================

-- ─── Service Types ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.service_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default service types from existing hardcoded categories
INSERT INTO public.service_types (name) VALUES
  ('Wymiana opon'),
  ('Serwis'),
  ('Naprawa'),
  ('Przechowywanie'),
  ('Pakiet'),
  ('Dojazd')
ON CONFLICT DO NOTHING;

-- ─── Vehicle Types ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vehicle_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default vehicle types
INSERT INTO public.vehicle_types (name) VALUES
  ('Osobowy'),
  ('Dostawczy'),
  ('Ciężarowy'),
  ('Przemysłowy')
ON CONFLICT DO NOTHING;

-- ─── Extend Services ─────────────────────────────────────────
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS vehicle_type_id UUID REFERENCES public.vehicle_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS required_skill_id UUID REFERENCES public.skills(id) ON DELETE SET NULL;

-- ─── Extend Clients ──────────────────────────────────────────
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS nip TEXT,
  ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS block_reason TEXT;

-- ─── Default "unknown" client ────────────────────────────────
INSERT INTO public.clients (name, phone, address, city, vehicles)
SELECT '!NIEOKREŚLONY', '-', '-', '-', '[]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.clients WHERE name = '!NIEOKREŚLONY'
);

-- ─── RLS policies for new tables ─────────────────────────────
ALTER TABLE public.service_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_types ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read
CREATE POLICY "service_types_read" ON public.service_types
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "vehicle_types_read" ON public.vehicle_types
  FOR SELECT TO authenticated USING (true);

-- Allow all operations for service role (admin via getAdminClient)
CREATE POLICY "service_types_all" ON public.service_types
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "vehicle_types_all" ON public.vehicle_types
  FOR ALL TO service_role USING (true) WITH CHECK (true);
