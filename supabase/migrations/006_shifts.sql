-- Shift tracking (RCP) table
CREATE TABLE IF NOT EXISTS public.shifts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  clock_in        TIMESTAMPTZ NOT NULL DEFAULT now(),
  clock_out       TIMESTAMPTZ,
  break_minutes   INT NOT NULL DEFAULT 0,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(employee_id, date)
);

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shifts_all" ON public.shifts FOR ALL USING (true);
CREATE INDEX IF NOT EXISTS shifts_employee_date_idx ON public.shifts(employee_id, date);
CREATE INDEX IF NOT EXISTS shifts_date_idx ON public.shifts(date);
