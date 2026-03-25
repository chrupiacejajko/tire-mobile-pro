-- Planner snapshots for undo functionality
-- Stores a snapshot of order states before any optimize/insert action,
-- allowing the dispatcher to revert changes within a 5-minute window.

create table planner_snapshots (
  id uuid primary key default gen_random_uuid(),
  token text unique not null,
  date text not null,
  snapshot jsonb not null, -- array of {order_id, employee_id, status, scheduled_time_start, scheduled_date}
  action_type text not null, -- 'optimize' | 'insert' | 'reassign' | 'reoptimize'
  created_by text,
  created_at timestamptz default now(),
  expires_at timestamptz default now() + interval '5 minutes'
);

-- Index for fast token lookups
create index planner_snapshots_token_idx on planner_snapshots(token);

-- Index for cleanup by expiry
create index planner_snapshots_expires_idx on planner_snapshots(expires_at);

-- RLS: only authenticated users with admin/dispatcher role can use snapshots
alter table planner_snapshots enable row level security;

create policy "Authenticated users can manage snapshots"
  on planner_snapshots
  for all
  using (auth.role() = 'authenticated');
