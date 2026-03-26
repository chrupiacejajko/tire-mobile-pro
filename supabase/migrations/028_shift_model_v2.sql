-- ============================================================================
-- Migration 028: New shift model (start_at + duration_minutes) + login_username
-- ============================================================================
-- Shifts stored as: start_at (TIMESTAMPTZ) + duration_minutes (INTEGER)
-- End time is NEVER stored — computed via generated column end_at
-- One shift = one record, even if spanning multiple days
-- ============================================================================

-- 1. Add new columns to work_schedules
ALTER TABLE work_schedules ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ;
ALTER TABLE work_schedules ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 480;

-- 2. Migrate existing data: date + start_time → start_at, duration from time diff
UPDATE work_schedules
SET
  start_at = (date::text || ' ' || COALESCE(start_time::text, '08:00:00'))::timestamp AT TIME ZONE 'Europe/Warsaw',
  duration_minutes = CASE
    WHEN end_time > start_time THEN EXTRACT(EPOCH FROM (end_time - start_time)) / 60
    WHEN end_time < start_time THEN EXTRACT(EPOCH FROM (('24:00:00'::time - start_time) + end_time)) / 60
    ELSE 480 -- fallback 8h
  END
WHERE start_at IS NULL;

-- 3. Make start_at NOT NULL now that data is migrated
ALTER TABLE work_schedules ALTER COLUMN start_at SET NOT NULL;
ALTER TABLE work_schedules ALTER COLUMN duration_minutes SET NOT NULL;

-- 4. Generated stored column: end_at = start_at + duration
ALTER TABLE work_schedules ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ
  GENERATED ALWAYS AS (start_at + (duration_minutes * interval '1 minute')) STORED;

-- 5. Drop old unique constraint and create new one
ALTER TABLE work_schedules DROP CONSTRAINT IF EXISTS work_schedules_employee_id_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS work_schedules_emp_start_uniq ON work_schedules(employee_id, start_at);

-- 6. New indexes for overlap queries
CREATE INDEX IF NOT EXISTS work_schedules_start_at_idx ON work_schedules(start_at);

-- 7. Drop old columns
ALTER TABLE work_schedules DROP COLUMN IF EXISTS date;
ALTER TABLE work_schedules DROP COLUMN IF EXISTS start_time;
ALTER TABLE work_schedules DROP COLUMN IF EXISTS end_time;
ALTER TABLE work_schedules DROP COLUMN IF EXISTS is_night_shift;

-- 8. Login username on employees
ALTER TABLE employees ADD COLUMN IF NOT EXISTS login_username TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS employees_login_username_uniq
  ON employees(login_username) WHERE login_username IS NOT NULL;

-- 9. Backfill login_username from existing auth emails
UPDATE employees e
SET login_username = REPLACE(p.email, '@routetire.pl', '')
FROM profiles p
WHERE e.user_id = p.id
  AND p.email LIKE '%@routetire.pl'
  AND e.login_username IS NULL;
