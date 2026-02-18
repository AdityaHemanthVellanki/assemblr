-- Action catalog persistence for universal ActionKit registry
-- Stores discovered integration capabilities with their schemas and Composio mappings

create table if not exists public.broker_capabilities (
  id text primary key default gen_random_uuid()::text,
  integration_id text not null,
  capability_id text not null,
  display_name text not null,
  description text,
  action_type text not null default 'READ'
    check (action_type in ('READ', 'WRITE', 'MUTATE', 'NOTIFY')),
  required_scopes text[] default '{}'::text[],
  input_schema jsonb default '{}'::jsonb,
  output_schema jsonb default '{}'::jsonb,
  composio_action_name text,
  resource text,
  discovered_at timestamptz default now(),
  ttl_hours integer default 24,
  unique (integration_id, capability_id)
);

create index if not exists idx_broker_cap_integration on public.broker_capabilities(integration_id);
create index if not exists idx_broker_cap_type on public.broker_capabilities(action_type);
create index if not exists idx_broker_cap_resource on public.broker_capabilities(resource);

-- RLS: service_role only (internal system table)
alter table public.broker_capabilities enable row level security;

create policy "service_role_full_access" on public.broker_capabilities
  for all using (true) with check (true);
