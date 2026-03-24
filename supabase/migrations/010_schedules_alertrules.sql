-- ═══ WORKER SCHEDULES (grafik zmian) ═══
CREATE TABLE IF NOT EXISTS public.work_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TIME NOT NULL DEFAULT '08:00',
  end_time TIME NOT NULL DEFAULT '16:00',
  is_night_shift BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, date)
);

ALTER TABLE public.work_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "work_schedules_all" ON public.work_schedules FOR ALL USING (true);
CREATE INDEX IF NOT EXISTS work_schedules_date_idx ON public.work_schedules(date);
CREATE INDEX IF NOT EXISTS work_schedules_employee_idx ON public.work_schedules(employee_id, date);

-- ═══ SCHEDULE TEMPLATES (szablony dni roboczych) ═══
CREATE TABLE IF NOT EXISTS public.schedule_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  -- days: which days of week this template applies to (1=Mon, 2=Tue, ..., 7=Sun)
  days_of_week INT[] NOT NULL DEFAULT '{1,2,3,4,5}',
  start_time TIME NOT NULL DEFAULT '08:00',
  end_time TIME NOT NULL DEFAULT '16:00',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.schedule_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "schedule_templates_all" ON public.schedule_templates FOR ALL USING (true);

-- Insert default templates
INSERT INTO public.schedule_templates (name, days_of_week, start_time, end_time) VALUES
  ('Standardowa zmiana (8-16)', '{1,2,3,4,5}', '08:00', '16:00'),
  ('Dluga zmiana (7-19)', '{1,2,3,4,5}', '07:00', '19:00'),
  ('Weekendowa (9-14)', '{6,7}', '09:00', '14:00')
ON CONFLICT (name) DO NOTHING;
