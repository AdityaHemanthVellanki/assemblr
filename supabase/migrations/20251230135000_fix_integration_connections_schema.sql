do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'integration_connections'
      and column_name = 'updated_at'
  ) then
    execute 'alter table public.integration_connections add column updated_at timestamptz not null default now()';
  end if;
end
$$;

update public.integration_connections
set updated_at = created_at
where updated_at is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and conrelid = 'public.integration_connections'::regclass
      and contype = 'u'
      and conname = 'integration_connections_org_id_integration_id_key'
  ) then
    execute 'alter table public.integration_connections add constraint integration_connections_org_id_integration_id_key unique (org_id, integration_id)';
  end if;
end
$$;

alter table public.integration_connections enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'integration_connections'
      and policyname = 'integration_connections_select_org'
  ) then
    execute $policy$
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
    $policy$;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'integration_connections'
      and policyname = 'integration_connections_modify_owner_editor'
  ) then
    execute $policy$
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
    $policy$;
  end if;
end
$$;
