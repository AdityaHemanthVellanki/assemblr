-- Add provider_account_id column to integration_connections for webhook lookups
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'integration_connections'
      and column_name = 'provider_account_id'
  ) then
    execute 'alter table public.integration_connections add column provider_account_id text';
  end if;
end
$$;

-- Add index for fast lookups by provider_account_id (e.g. for webhooks)
create index if not exists idx_integration_connections_provider_account_id 
  on public.integration_connections(provider_account_id);
