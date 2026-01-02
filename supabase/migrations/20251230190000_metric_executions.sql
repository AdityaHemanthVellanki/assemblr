-- Update metrics table with execution policy
alter table public.metrics 
add column if not exists execution_policy jsonb default '{"mode": "on_demand", "ttl_seconds": 3600}'::jsonb;

-- Create metric_executions table
create table if not exists public.metric_executions (
  id uuid default gen_random_uuid() primary key,
  metric_id uuid not null references public.metrics(id) on delete cascade,
  status text not null check (status in ('pending', 'running', 'completed', 'failed')),
  
  started_at timestamptz default now(),
  completed_at timestamptz,
  
  result jsonb,
  error text,
  
  triggered_by text default 'system', -- system, user, scheduler
  
  created_at timestamptz default now()
);

-- Index for finding latest execution per metric
create index if not exists idx_metric_executions_metric_latest 
on public.metric_executions(metric_id, completed_at desc);

alter table public.metric_executions enable row level security;

create policy "Users can view executions of their org metrics"
on public.metric_executions for select
to authenticated
using (
  exists (
    select 1 from public.metrics m
    join public.memberships mem on mem.org_id = m.org_id
    where m.id = metric_executions.metric_id
    and mem.user_id = auth.uid()
  )
);

-- Allow backend (service role) to manage executions. 
-- For now, authenticated users (via server actions) can also insert if they trigger it.
create policy "Users can trigger executions"
on public.metric_executions for insert
to authenticated
with check (
  exists (
    select 1 from public.metrics m
    join public.memberships mem on mem.org_id = m.org_id
    where m.id = metric_executions.metric_id
    and mem.user_id = auth.uid()
  )
);
