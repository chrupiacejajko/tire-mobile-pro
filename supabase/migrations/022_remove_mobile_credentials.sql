-- ============================================================
-- 022_remove_mobile_credentials.sql
-- Remove plaintext mobile_login and mobile_password columns.
-- These are replaced by the invite flow (worker_invites table).
--
-- PREREQUISITE: Deploy 021_rls_tightening.sql first.
-- Ensure all employees have been migrated to invite-based auth
-- before dropping these columns in production.
-- ============================================================

ALTER TABLE public.employees
  DROP COLUMN IF EXISTS mobile_login,
  DROP COLUMN IF EXISTS mobile_password;
