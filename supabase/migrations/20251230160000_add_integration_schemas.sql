create table if not exists public.integration_schemas (
  id uuid default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  integration_id text not null,
  resource text not null,
  schema_json jsonb not null, -- Stores DiscoveredSchema structure
  last_discovered_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  
  unique(org_id, integration_id, resource)
);

alter table public.integration_schemas enable row level security;

create policy "Users can view schemas of their org"
on public.integration_schemas for select
to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.org_id = integration_schemas.org_id
    and m.user_id = auth.uid()
  )
);

create policy "System can manage schemas"
on public.integration_schemas for all
to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.org_id = integration_schemas.org_id
    and m.user_id = auth.uid()
    and m.role in ('owner', 'editor')
  )
);
