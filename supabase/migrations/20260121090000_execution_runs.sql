create table if not exists public.execution_runs (
  id uuid default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  tool_id uuid not null references public.projects(id) on delete cascade,
  trigger_id text,
  status text not null check (status in ('pending', 'running', 'blocked', 'completed', 'failed')),
  current_step text,
  state_snapshot jsonb default '{}'::jsonb,
  retries integer default 0,
  logs jsonb[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.execution_runs enable row level security;

create policy "Users can view execution runs of their org"
on public.execution_runs for select
to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.org_id = execution_runs.org_id
    and m.user_id = auth.uid()
  )
);

create policy "Users can manage execution runs of their org"
on public.execution_runs for all
to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.org_id = execution_runs.org_id
    and m.user_id = auth.uid()
    and m.role in ('owner', 'editor')
  )
);
