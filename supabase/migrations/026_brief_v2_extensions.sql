-- Migration 026: Brief v2 extensions
-- Adds: employee default location, work schedule base location,
--        region display order, order dispatcher notes/additional phone,
--        internal tasks support, pending SMS queue

-- ══════════════════════════════════════════════════════════════════
-- 1. Employees: default home address (starting point for shifts)
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS default_location TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS default_lat DOUBLE PRECISION;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS default_lng DOUBLE PRECISION;

-- ══════════════════════════════════════════════════════════════════
-- 2. Work schedules: base location per shift (where worker departs from)
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE public.work_schedules ADD COLUMN IF NOT EXISTS location_address TEXT;
ALTER TABLE public.work_schedules ADD COLUMN IF NOT EXISTS location_lat DOUBLE PRECISION;
ALTER TABLE public.work_schedules ADD COLUMN IF NOT EXISTS location_lng DOUBLE PRECISION;

-- ══════════════════════════════════════════════════════════════════
-- 3. Regions: display order for timeline axis
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE public.regions ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_regions_display_order ON public.regions(display_order);

-- Backfill: set display_order based on creation order
DO $$
DECLARE
  r RECORD;
  i INTEGER := 1;
BEGIN
  FOR r IN SELECT id FROM public.regions ORDER BY created_at LOOP
    UPDATE public.regions SET display_order = i WHERE id = r.id AND display_order = 0;
    i := i + 1;
  END LOOP;
END $$;

-- ══════════════════════════════════════════════════════════════════
-- 4. Orders: dispatcher notes, additional phone, internal tasks
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS dispatcher_notes TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS additional_phone TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS internal_task_type TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_paid_time BOOLEAN DEFAULT true;

-- Add check constraint for internal_task_type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'orders_internal_task_type_check'
  ) THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_internal_task_type_check
      CHECK (internal_task_type IS NULL OR internal_task_type IN ('pickup', 'cleaning', 'delivery', 'other'));
  END IF;
END $$;

-- Extend source constraint to include 'internal'
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_source_check;
DO $$
BEGIN
  ALTER TABLE public.orders ADD CONSTRAINT orders_source_check
    CHECK (source IN ('dispatcher', 'booking', 'phone', 'recurring', 'internal'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- ══════════════════════════════════════════════════════════════════
-- 5. Pending SMS queue (for delayed notifications like tracking links)
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.pending_sms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  send_at TIMESTAMPTZ NOT NULL,
  sent BOOLEAN DEFAULT false,
  sent_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_sms_unsent ON public.pending_sms(send_at) WHERE sent = false;

-- RLS for pending_sms (admin only)
ALTER TABLE public.pending_sms ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pending_sms' AND policyname = 'Admin full access to pending_sms'
  ) THEN
    CREATE POLICY "Admin full access to pending_sms" ON public.pending_sms
      FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;
