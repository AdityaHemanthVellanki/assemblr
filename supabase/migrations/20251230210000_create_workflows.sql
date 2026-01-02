-- Create workflows table
create table if not exists public.workflows (
  id uuid default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  enabled boolean default true,
  
  -- Trigger Configuration
  -- { type: 'alert', alert_id: '...' } OR { type: 'schedule', cron: '...' }
  trigger_config jsonb not null,
  
  -- Actions List
  -- [{ type: 'slack', config: {...} }, { type: 'email', config: {...} }]
  actions jsonb[] not null default '{}',
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create workflow runs history
create table if not exists public.workflow_runs (
  id uuid default gen_random_uuid() primary key,
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  
  status text not null check (status in ('pending', 'running', 'completed', 'failed')),
  started_at timestamptz default now(),
  completed_at timestamptz,
  
  trigger_event jsonb, -- Snapshot of data that triggered this run
  logs jsonb[], -- Execution logs per action
  error text,
  
  created_at timestamptz default now()
);

alter table public.workflows enable row level security;
alter table public.workflow_runs enable row level security;

-- Policies
create policy "Users can view workflows of their org"
on public.workflows for select
to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.org_id = workflows.org_id
    and m.user_id = auth.uid()
  )
);

create policy "Users can manage workflows of their org"
on public.workflows for all
to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.org_id = workflows.org_id
    and m.user_id = auth.uid()
    and m.role in ('owner', 'editor')
  )
);

create policy "Users can view workflow runs of their org"
on public.workflow_runs for select
to authenticated
using (
  exists (
    select 1 from public.workflows w
    join public.memberships m on m.org_id = w.org_id
    where w.id = workflow_runs.workflow_id
    and m.user_id = auth.uid()
  )
);
