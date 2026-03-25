-- Migration 027: Enable Supabase Realtime for orders and work_schedules tables
-- This allows the client to subscribe to INSERT/UPDATE/DELETE events via
-- Supabase Realtime (postgres_changes).

ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.work_schedules;
