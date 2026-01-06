alter table public.integration_schemas
add column if not exists last_discovered_at timestamptz;
