-- Create alerts table
create table if not exists public.alerts (
  id uuid default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  metric_id uuid not null references public.metrics(id) on delete cascade,
  
  -- Condition Definition
  condition_type text not null default 'threshold', -- threshold, change
  comparison_op text not null, -- gt, lt, eq, gte, lte
  threshold_value double precision not null,
  
  -- Action Definition
  action_config jsonb not null default '{}'::jsonb, -- { type: 'email' | 'slack', target: '...' }
  
  enabled boolean default true,
  last_triggered_at timestamptz,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create alert history
create table if not exists public.alert_history (
  id uuid default gen_random_uuid() primary key,
  alert_id uuid not null references public.alerts(id) on delete cascade,
  execution_id uuid references public.metric_executions(id),
  
  triggered boolean not null,
  measured_value double precision,
  
  created_at timestamptz default now()
);

alter table public.alerts enable row level security;
alter table public.alert_history enable row level security;

-- Policies
create policy "Users can view alerts of their org"
on public.alerts for select
to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.org_id = alerts.org_id
    and m.user_id = auth.uid()
  )
);

create policy "Users can manage alerts of their org"
on public.alerts for all
to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.org_id = alerts.org_id
    and m.user_id = auth.uid()
    and m.role in ('owner', 'editor')
  )
);

create policy "Users can view alert history of their org"
on public.alert_history for select
to authenticated
using (
  exists (
    select 1 from public.alerts a
    join public.memberships m on m.org_id = a.org_id
    where a.id = alert_history.alert_id
    and m.user_id = auth.uid()
  )
);
