-- Create execution_traces table
create table if not exists public.execution_traces (
  id uuid default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  
  trace_type text not null, -- metric, alert, workflow
  source text not null, -- schedule, chat, dependency
  trigger_ref text, -- id of what triggered it (optional)
  
  inputs jsonb default '{}'::jsonb,
  outputs jsonb default '{}'::jsonb,
  
  -- Lineage
  dependencies uuid[] default '{}', -- parent trace ids
  
  status text not null check (status in ('pending', 'running', 'completed', 'failed')),
  error text,
  
  started_at timestamptz default now(),
  completed_at timestamptz,
  
  metadata jsonb default '{}'::jsonb,
  
  created_at timestamptz default now()
);

alter table public.execution_traces enable row level security;

-- Policies
create policy "Users can view traces of their org"
on public.execution_traces for select
to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.org_id = execution_traces.org_id
    and m.user_id = auth.uid()
  )
);

create policy "Users can insert traces"
on public.execution_traces for insert
to authenticated
with check (
  exists (
    select 1 from public.memberships m
    where m.org_id = execution_traces.org_id
    and m.user_id = auth.uid()
  )
);
