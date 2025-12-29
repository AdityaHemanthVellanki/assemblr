
create table public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  integration_id text not null,
  encrypted_credentials text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, integration_id)
);

alter table public.integration_connections enable row level security;

create policy integration_connections_select_org
on public.integration_connections
for select
to authenticated
using (
  exists (
    select 1
    from public.memberships m
    where m.org_id = integration_connections.org_id
      and m.user_id = auth.uid()
  )
);

create policy integration_connections_modify_owner_editor
on public.integration_connections
for all
to authenticated
using (
  exists (
    select 1
    from public.memberships m
    where m.org_id = integration_connections.org_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'editor')
  )
)
with check (
  exists (
    select 1
    from public.memberships m
    where m.org_id = integration_connections.org_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'editor')
  )
);
