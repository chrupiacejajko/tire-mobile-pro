-- ============================================================
-- 019_employee_state_history.sql
-- Immutable audit log for all employee state changes.
-- Every change to work_status, planner_status, or account_status
-- must write a row here — never update/delete existing rows.
-- ============================================================

CREATE TABLE IF NOT EXISTS employee_state_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  -- Which field changed
  changed_field TEXT NOT NULL
                CHECK (changed_field IN (
                  'work_status', 'planner_status', 'account_status'
                )),
  old_value     TEXT,           -- NULL on first set
  new_value     TEXT NOT NULL,
  -- Who/what caused the change
  source        TEXT NOT NULL
                CHECK (source IN ('worker', 'admin', 'system')),
  reason        TEXT,           -- Required for admin overrides, optional otherwise
  changed_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- Traceability
  request_id    TEXT,           -- X-Request-ID header or generated UUID
  ip_address    INET,
  changed_at    TIMESTAMPTZ DEFAULT now()
);

-- Efficient lookups
CREATE INDEX IF NOT EXISTS idx_state_history_emp_time
  ON employee_state_history(employee_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_state_history_recent
  ON employee_state_history(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_state_history_changed_by
  ON employee_state_history(changed_by, changed_at DESC);

-- RLS
ALTER TABLE employee_state_history ENABLE ROW LEVEL SECURITY;

-- Admin: full read access (immutable — no writes via RLS, only via service role)
CREATE POLICY "admin_read_all_history" ON employee_state_history
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Worker: can read own history (for transparency / /worker/profile)
CREATE POLICY "worker_read_own_history" ON employee_state_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM employees e
      JOIN profiles p ON p.id = e.user_id
      WHERE e.id = employee_id AND p.id = auth.uid()
    )
  );

-- No INSERT/UPDATE/DELETE via RLS — always use service role (admin client) in API handlers.
-- This ensures audit rows can't be tampered with by any role.
