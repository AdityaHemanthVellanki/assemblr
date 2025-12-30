do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'integration_connections'
      and column_name = 'oauth_client_id'
  ) then
    execute 'alter table public.integration_connections add column oauth_client_id text';
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
      and column_name = 'source'
  ) then
    execute 'alter table public.integration_connections add column source text not null default ''settings''';
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'integration_connections'
      and column_name = 'encrypted_credentials'
      and is_nullable = 'NO'
  ) then
    execute 'alter table public.integration_connections alter column encrypted_credentials drop not null';
  end if;
end
$$;

alter table public.integration_connections
  drop constraint if exists integration_connections_status_check;

alter table public.integration_connections
  add constraint integration_connections_status_check
  check (status in ('active', 'pending', 'pending_setup', 'error'));
