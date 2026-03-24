-- ═══ SUBTASKS (Czynności) ═══
CREATE TABLE IF NOT EXISTS public.task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  steps JSONB NOT NULL DEFAULT '[]',
  -- steps: [{ "name": "Sprawdź stan opon", "required": true, "order": 1 }, ...]
  enforce_order BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.task_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_templates_all" ON public.task_templates FOR ALL USING (true);

-- Link services to task templates
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS task_template_id UUID REFERENCES public.task_templates(id);

-- Order subtasks tracking (per order, tracks completion of each step)
CREATE TABLE IF NOT EXISTS public.order_subtasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  step_name TEXT NOT NULL,
  step_order INT NOT NULL DEFAULT 0,
  is_required BOOLEAN NOT NULL DEFAULT true,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES public.employees(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.order_subtasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_subtasks_all" ON public.order_subtasks FOR ALL USING (true);
CREATE INDEX IF NOT EXISTS order_subtasks_order_idx ON public.order_subtasks(order_id);

-- ═══ CLOSURE CODES ═══
CREATE TABLE IF NOT EXISTS public.closure_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('completed', 'not_completed', 'cancelled')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.closure_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "closure_codes_all" ON public.closure_codes FOR ALL USING (true);

-- Add closure_code to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS closure_code_id UUID REFERENCES public.closure_codes(id);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS closure_notes TEXT;

-- Insert default closure codes
INSERT INTO public.closure_codes (code, label, category) VALUES
  ('DONE_OK', 'Wykonane pomyślnie', 'completed'),
  ('DONE_PARTIAL', 'Wykonane częściowo', 'completed'),
  ('NOT_HOME', 'Klient nieobecny', 'not_completed'),
  ('NO_PARTS', 'Brak części/materiałów', 'not_completed'),
  ('WRONG_ADDRESS', 'Nieprawidłowy adres', 'not_completed'),
  ('CLIENT_CANCEL', 'Anulowane przez klienta', 'cancelled'),
  ('WEATHER', 'Warunki pogodowe', 'not_completed'),
  ('OTHER', 'Inny powód', 'not_completed')
ON CONFLICT (code) DO NOTHING;

-- ═══ EMPLOYEE UNAVAILABILITY ═══
CREATE TABLE IF NOT EXISTS public.unavailabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('vacation', 'sick_leave', 'training', 'personal', 'other')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  recurrence_day INT, -- 0=Sunday, 1=Monday, etc. for weekly recurring
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

ALTER TABLE public.unavailabilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "unavailabilities_all" ON public.unavailabilities FOR ALL USING (true);
CREATE INDEX IF NOT EXISTS unavailabilities_employee_idx ON public.unavailabilities(employee_id);
CREATE INDEX IF NOT EXISTS unavailabilities_dates_idx ON public.unavailabilities(start_date, end_date);

-- ═══ WEBHOOKS CONFIG ═══
CREATE TABLE IF NOT EXISTS public.webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{}',
  -- events: 'order.created', 'order.status_changed', 'order.assigned', 'order.completed'
  is_active BOOLEAN NOT NULL DEFAULT true,
  secret TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "webhooks_all" ON public.webhooks FOR ALL USING (true);

-- ═══ DISPATCHER ALERTS CONFIG ═══
CREATE TABLE IF NOT EXISTS public.alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  event TEXT NOT NULL,
  -- events: 'order_not_completed', 'sla_breach', 'worker_idle', 'worker_left_zone', 'no_progress'
  condition JSONB NOT NULL DEFAULT '{}',
  -- e.g. {"minutes_threshold": 30} for no_progress
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.alert_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alert_rules_all" ON public.alert_rules FOR ALL USING (true);

CREATE TABLE IF NOT EXISTS public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES public.alert_rules(id),
  order_id UUID REFERENCES public.orders(id),
  employee_id UUID REFERENCES public.employees(id),
  message TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alerts_all" ON public.alerts FOR ALL USING (true);
CREATE INDEX IF NOT EXISTS alerts_unread_idx ON public.alerts(is_read) WHERE is_read = false;
