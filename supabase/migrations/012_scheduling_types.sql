-- Scheduling type: how the customer wants the appointment
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS scheduling_type TEXT DEFAULT 'time_window'
  CHECK (scheduling_type IN ('asap', 'fixed_time', 'time_window', 'flexible'));

-- Explicit time window boundaries (instead of relying on hardcoded morning/afternoon/evening)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS time_window_start TIME;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS time_window_end TIME;

-- How many minutes of flexibility the customer allows (e.g., ±15 min for fixed_time)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS flexibility_minutes INT DEFAULT 0;

-- Was this order auto-assigned by the system?
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS auto_assigned BOOLEAN DEFAULT false;

-- Estimated arrival and travel time (calculated by optimizer/suggest)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS estimated_arrival TIME;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS estimated_travel_minutes INT;

-- Source: where did this order come from?
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'dispatcher'
  CHECK (source IN ('dispatcher', 'booking', 'phone', 'recurring'));

-- Backfill existing orders: set time_window_start/end based on time_window text
UPDATE public.orders SET
  time_window_start = CASE time_window
    WHEN 'morning' THEN '08:00'
    WHEN 'afternoon' THEN '12:00'
    WHEN 'evening' THEN '16:00'
    ELSE NULL END,
  time_window_end = CASE time_window
    WHEN 'morning' THEN '12:00'
    WHEN 'afternoon' THEN '16:00'
    WHEN 'evening' THEN '20:00'
    ELSE NULL END
WHERE time_window IS NOT NULL AND time_window_start IS NULL;

-- Backfill scheduling_type based on existing data
UPDATE public.orders SET scheduling_type = 'fixed_time'
WHERE scheduled_time_start IS NOT NULL AND time_window IS NULL;

UPDATE public.orders SET scheduling_type = 'time_window'
WHERE time_window IS NOT NULL;
