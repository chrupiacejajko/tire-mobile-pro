-- ═══ SKILLS TABLE ═══
CREATE TABLE IF NOT EXISTS public.skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "skills_all" ON public.skills FOR ALL USING (true);

INSERT INTO public.skills (name, description) VALUES
  ('Serwis opon osobowych', 'Wymiana i naprawa opon w samochodach osobowych'),
  ('Serwis opon dostawczych', 'Obsługa opon w pojazdach dostawczych do 3.5t'),
  ('Serwis opon ciężarowych', 'Obsługa opon w pojazdach ciężarowych powyżej 3.5t'),
  ('Serwis opon przemysłowych', 'Obsługa opon w maszynach przemysłowych i budowlanych')
ON CONFLICT (name) DO NOTHING;

-- ═══ EMPLOYEE_SKILLS JUNCTION ═══
CREATE TABLE IF NOT EXISTS public.employee_skills (
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  PRIMARY KEY (employee_id, skill_id)
);
ALTER TABLE public.employee_skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employee_skills_all" ON public.employee_skills FOR ALL USING (true);

-- ═══ VEHICLE_SKILLS JUNCTION ═══
CREATE TABLE IF NOT EXISTS public.vehicle_skills (
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  PRIMARY KEY (vehicle_id, skill_id)
);
ALTER TABLE public.vehicle_skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vehicle_skills_all" ON public.vehicle_skills FOR ALL USING (true);

-- ═══ ALTER EMPLOYEES ═══
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS phone_secondary TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS default_vehicle_id UUID REFERENCES public.vehicles(id);
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS shift_rate DECIMAL;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS mobile_login TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS mobile_password TEXT;

-- ═══ ALTER REGIONS ═══
ALTER TABLE public.regions ADD COLUMN IF NOT EXISTS main_address TEXT;
ALTER TABLE public.regions ADD COLUMN IF NOT EXISTS main_lat DOUBLE PRECISION;
ALTER TABLE public.regions ADD COLUMN IF NOT EXISTS main_lng DOUBLE PRECISION;
ALTER TABLE public.regions ADD COLUMN IF NOT EXISTS free_zone_polygon JSONB;

-- ═══ ALTER WORK_SCHEDULES ═══
ALTER TABLE public.work_schedules ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES public.vehicles(id);
ALTER TABLE public.work_schedules ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES public.regions(id);
