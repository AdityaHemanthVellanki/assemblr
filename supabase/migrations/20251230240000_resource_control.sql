-- Create org_budgets table
create table if not exists public.org_budgets (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  
  -- Limits (Credits)
  daily_limit integer not null default 1000,
  monthly_limit integer not null default 10000,
  
  -- Usage
  used_today integer not null default 0,
  used_this_month integer not null default 0,
  
  last_reset_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create integration_limits table
create table if not exists public.integration_limits (
  integration_type text primary key, -- github, slack, linear
  requests_per_minute integer not null default 60,
  concurrency_limit integer not null default 5,
  updated_at timestamptz default now()
);

-- Insert default limits
insert into public.integration_limits (integration_type, requests_per_minute, concurrency_limit)
values 
  ('github', 30, 5),
  ('slack', 20, 2),
  ('linear', 60, 10)
on conflict (integration_type) do nothing;

alter table public.org_budgets enable row level security;
alter table public.integration_limits enable row level security;

-- Policies
create policy "Users can view budgets of their org"
on public.org_budgets for select
to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.org_id = org_budgets.org_id
    and m.user_id = auth.uid()
  )
);

create policy "Users can view integration limits"
on public.integration_limits for select
to authenticated
using (true);
