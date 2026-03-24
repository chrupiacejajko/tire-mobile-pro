-- ============================================================
-- 018_employee_operational_state.sql
-- Live operational state for each employee.
--
-- Semantics (single source of truth):
--   employees.is_active     = permanently deactivated account (admin action)
--   account_status          = onboarding lifecycle (invited → active → blocked)
--   work_status             = real-time shift state (worker self-reports)
--   planner_status          = dispatcher override of planner availability
--
-- shift_plan_status is NOT stored here — it is computed dynamically
-- from work_schedules to avoid drift (see /api/worker/me).
-- ============================================================

CREATE TABLE IF NOT EXISTS employee_operational_state (
  employee_id     UUID PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  account_status  TEXT NOT NULL DEFAULT 'invited'
                  CHECK (account_status IN ('invited', 'active', 'blocked')),
  work_status     TEXT NOT NULL DEFAULT 'off_work'
                  CHECK (work_status IN ('off_work', 'on_work', 'break')),
  planner_status  TEXT NOT NULL DEFAULT 'available'
                  CHECK (planner_status IN (
                    'available', 'unavailable',
                    'forced_available', 'forced_unavailable'
                  )),
  -- Cached GPS freshness (updated by /api/gps webhook)
  last_gps_at     TIMESTAMPTZ,
  gps_lat         DOUBLE PRECISION,
  gps_lng         DOUBLE PRECISION,
  -- Last any state change
  last_activity_at TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Backfill: all currently active employees get account_status='active'
INSERT INTO employee_operational_state (employee_id, account_status)
SELECT
  id,
  CASE WHEN is_active THEN 'active' ELSE 'blocked' END
FROM employees
ON CONFLICT (employee_id) DO NOTHING;

-- Trigger: sync employees.is_active → account_status
CREATE OR REPLACE FUNCTION fn_sync_employee_active_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- When admin sets is_active = false → block the account
  IF NEW.is_active = false AND OLD.is_active = true THEN
    INSERT INTO employee_operational_state (employee_id, account_status)
    VALUES (NEW.id, 'blocked')
    ON CONFLICT (employee_id) DO UPDATE
      SET account_status = 'blocked', updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_employee_active ON employees;
CREATE TRIGGER trg_sync_employee_active
  AFTER UPDATE OF is_active ON employees
  FOR EACH ROW
  EXECUTE FUNCTION fn_sync_employee_active_status();

-- RLS
ALTER TABLE employee_operational_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_operational_state" ON employee_operational_state
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "dispatcher_read_operational_state" ON employee_operational_state
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dispatcher'))
  );

CREATE POLICY "worker_read_own_operational_state" ON employee_operational_state
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM employees e
      JOIN profiles p ON p.id = e.user_id
      WHERE e.id = employee_id AND p.id = auth.uid()
    )
  );
