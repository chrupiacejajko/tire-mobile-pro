CREATE TABLE IF NOT EXISTS public.recurring_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  service_ids UUID[] NOT NULL DEFAULT '{}',
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'quarterly')),
  preferred_day INT, -- 0=Sunday, 1=Monday, etc.
  preferred_time_window TEXT CHECK (preferred_time_window IN ('morning', 'afternoon', 'evening')),
  preferred_employee_id UUID REFERENCES public.employees(id),
  address TEXT,
  city TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  next_date DATE,
  last_generated DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.recurring_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recurring_orders_all" ON public.recurring_orders FOR ALL USING (true);
CREATE INDEX IF NOT EXISTS recurring_orders_next_date_idx ON public.recurring_orders(next_date) WHERE is_active = true;
