-- Worker notifications for order assignments and other events
CREATE TABLE IF NOT EXISTS public.worker_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('order_assigned', 'order_updated', 'order_cancelled', 'schedule_change', 'general')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  channel TEXT DEFAULT 'in_app' CHECK (channel IN ('in_app', 'sms', 'email', 'push')),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.worker_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "worker_notifications_all" ON public.worker_notifications FOR ALL USING (true);
CREATE INDEX IF NOT EXISTS worker_notif_employee_idx ON public.worker_notifications(employee_id, is_read, created_at DESC);
