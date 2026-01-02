create table if not exists public.metrics (
  id uuid default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  
  -- Execution metadata
  integration_id text not null,
  capability_id text not null,
  resource text not null,
  
  -- The definition JSON stores fields, filters, aggregation
  definition jsonb not null,
  
  version integer default 1,
  
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  
  -- Uniqueness: Name per org should be unique to avoid confusion
  unique(org_id, name)
);

alter table public.metrics enable row level security;

create policy "Users can view metrics of their org"
on public.metrics for select
to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.org_id = metrics.org_id
    and m.user_id = auth.uid()
  )
);

create policy "Users can manage metrics of their org"
on public.metrics for all
to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.org_id = metrics.org_id
    and m.user_id = auth.uid()
    and m.role in ('owner', 'editor')
  )
);
