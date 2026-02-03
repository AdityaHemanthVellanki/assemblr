do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'integration_connections'
      and column_name = 'scopes'
  ) then
    execute 'alter table public.integration_connections add column scopes text[]';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'integration_connections'
      and column_name = 'connected_at'
  ) then
    execute 'alter table public.integration_connections add column connected_at timestamptz';
  end if;
end
$$;

update public.integration_connections
set connected_at = created_at
where connected_at is null;

create table if not exists public.org_integrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  integration_id text not null,
  status text not null check (status in ('active','missing_permissions','error','pending','revoked')),
  scopes text[] default '{}'::text[],
  connected_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (org_id, integration_id)
);

alter table public.org_integrations enable row level security;

create policy "read org integrations"
on public.org_integrations
for select
to authenticated
using (
  exists (
    select 1
    from public.memberships m
    where m.org_id = org_integrations.org_id
      and m.user_id = auth.uid()
  )
);

create policy "modify org integrations"
on public.org_integrations
for all
to authenticated
using (
  exists (
    select 1
    from public.memberships m
    where m.org_id = org_integrations.org_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'editor')
  )
)
with check (
  exists (
    select 1
    from public.memberships m
    where m.org_id = org_integrations.org_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'editor')
  )
);

grant select, insert, update, delete on table public.org_integrations to authenticated;
grant select, insert, update, delete on table public.org_integrations to service_role;

create table if not exists public.integration_audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  integration_id text not null,
  event_type text not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table public.integration_audit_logs enable row level security;

create policy "read integration audit logs"
on public.integration_audit_logs
for select
to authenticated
using (
  exists (
    select 1
    from public.memberships m
    where m.org_id = integration_audit_logs.org_id
      and m.user_id = auth.uid()
  )
);

create policy "insert integration audit logs"
on public.integration_audit_logs
for insert
to authenticated
with check (
  exists (
    select 1
    from public.memberships m
    where m.org_id = integration_audit_logs.org_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'editor')
  )
);

grant select, insert on table public.integration_audit_logs to authenticated;
grant select, insert on table public.integration_audit_logs to service_role;
