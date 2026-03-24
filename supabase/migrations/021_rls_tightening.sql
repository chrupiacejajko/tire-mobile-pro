-- ============================================================
-- 021_rls_tightening.sql
-- Replace permissive USING(true) policies with role-based ones.
--
-- PREREQUISITE: Deploy Phases 0-4 first.
-- All API routes must use withAuth()/checkAuth() before this runs,
-- because client-side Supabase calls will now be filtered by role.
--
-- Strategy:
--   admin/dispatcher → full access via service role (API layer)
--   worker          → sees only own data via Supabase client
--   anon            → blocked everywhere except public tables
-- ============================================================

-- ── orders ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated read orders"   ON public.orders;
DROP POLICY IF EXISTS "Authenticated manage orders" ON public.orders;

-- Admin/dispatcher: full access (API layer uses service role anyway)
CREATE POLICY "admin_dispatcher_all_orders" ON public.orders
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'dispatcher')
    )
  );

-- Worker: can only read orders assigned to them
CREATE POLICY "worker_own_orders" ON public.orders
  FOR SELECT
  USING (
    employee_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
  );

-- ── employee_locations ───────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated read locations"   ON public.employee_locations;
DROP POLICY IF EXISTS "Authenticated manage locations" ON public.employee_locations;

CREATE POLICY "admin_dispatcher_all_locations" ON public.employee_locations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'dispatcher')
    )
  );

-- Worker: own GPS data only
CREATE POLICY "worker_own_locations" ON public.employee_locations
  FOR ALL
  USING (
    employee_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
  );

-- ── employees ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated read employees" ON public.employees;
DROP POLICY IF EXISTS "Admins manage employees"      ON public.employees;

-- Admin: full management
CREATE POLICY "admin_all_employees" ON public.employees
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Dispatcher: read-only (to show worker names/plates in map/planner)
CREATE POLICY "dispatcher_read_employees" ON public.employees
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'dispatcher'
    )
  );

-- Worker: can read own employee record
CREATE POLICY "worker_own_employee" ON public.employees
  FOR SELECT
  USING (user_id = auth.uid());

-- ── worker_notifications ─────────────────────────────────────
DROP POLICY IF EXISTS "worker_notifications_all" ON public.worker_notifications;

-- Admin: full access
CREATE POLICY "admin_all_worker_notifications" ON public.worker_notifications
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Worker: own notifications only
CREATE POLICY "worker_own_notifications" ON public.worker_notifications
  FOR ALL
  USING (
    employee_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
  );

-- ── shifts ───────────────────────────────────────────────────
-- Allow workers to read/write their own shifts (clock in/out)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'shifts' AND policyname = 'worker_own_shifts'
  ) THEN
    CREATE POLICY "worker_own_shifts" ON public.shifts
      FOR ALL
      USING (
        employee_id IN (
          SELECT id FROM public.employees WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'shifts' AND policyname = 'admin_all_shifts'
  ) THEN
    CREATE POLICY "admin_all_shifts" ON public.shifts
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() AND role IN ('admin', 'dispatcher')
        )
      );
  END IF;
END $$;

-- ── order_photos ─────────────────────────────────────────────
-- Workers can insert photos for their own orders
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'order_photos' AND policyname = 'worker_own_order_photos'
  ) THEN
    CREATE POLICY "worker_own_order_photos" ON public.order_photos
      FOR ALL
      USING (
        order_id IN (
          SELECT o.id FROM public.orders o
          JOIN public.employees e ON e.id = o.employee_id
          WHERE e.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ── order_subtasks ───────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'order_subtasks' AND policyname = 'worker_own_order_subtasks'
  ) THEN
    CREATE POLICY "worker_own_order_subtasks" ON public.order_subtasks
      FOR ALL
      USING (
        order_id IN (
          SELECT o.id FROM public.orders o
          JOIN public.employees e ON e.id = o.employee_id
          WHERE e.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ── Tables that remain open to all authenticated (low sensitivity) ──
-- regions, services, skills, closure_codes, task_templates:
-- Workers need to read these to show service names, closure codes etc.
-- No change needed — existing USING(true) policies are acceptable here.
-- clients: workers need client name/address for their orders — acceptable.
