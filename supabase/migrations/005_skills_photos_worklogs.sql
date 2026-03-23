-- ── Skills on employees ──────────────────────────────────────────────────────
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS skills TEXT[] DEFAULT '{}';

-- ── Required skills on orders ────────────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS required_skills TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- ── Order photos ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_photos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  taken_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.order_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_photos_all" ON public.order_photos FOR ALL USING (true);
CREATE INDEX IF NOT EXISTS order_photos_order_id_idx ON public.order_photos(order_id);

-- ── Work logs (Faza 5 — time tracking) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.work_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  employee_id       UUID REFERENCES public.employees(id),
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at          TIMESTAMPTZ,
  duration_minutes  INT GENERATED ALWAYS AS (
    CASE WHEN ended_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (ended_at - started_at))::INT / 60
      ELSE NULL
    END
  ) STORED,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.work_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "work_logs_all" ON public.work_logs FOR ALL USING (true);
CREATE INDEX IF NOT EXISTS work_logs_order_id_idx ON public.work_logs(order_id);
CREATE INDEX IF NOT EXISTS work_logs_employee_id_idx ON public.work_logs(employee_id);

-- ── Indexes for performance ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS orders_scheduled_date_idx ON public.orders(scheduled_date);
CREATE INDEX IF NOT EXISTS orders_employee_id_idx    ON public.orders(employee_id);
CREATE INDEX IF NOT EXISTS orders_status_idx         ON public.orders(status);
