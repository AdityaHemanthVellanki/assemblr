create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  integration_id text not null,
  encrypted_credentials text not null,
  created_at timestamptz default now()
);

alter table public.integration_connections enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'integration_connections'
      and policyname = 'read integration connections'
  ) then
    execute $policy$
      create policy "read integration connections"
      on public.integration_connections
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.memberships
          where memberships.org_id = integration_connections.org_id
            and memberships.user_id = auth.uid()
        )
      );
    $policy$;
  end if;
end
$$;
