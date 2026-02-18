create table if not exists public.webhook_endpoints (
  id uuid default gen_random_uuid() primary key,
  org_id uuid not null,
  tool_id uuid not null,
  trigger_id text not null,
  secret text not null,
  enabled boolean default true,
  last_invoked_at timestamptz,
  invocation_count integer default 0,
  created_at timestamptz default now()
);

create unique index if not exists idx_webhook_tool_trigger
  on public.webhook_endpoints(tool_id, trigger_id);

create index if not exists idx_webhook_org
  on public.webhook_endpoints(org_id);

-- Helper function to increment invocation count atomically
create or replace function public.increment_webhook_count(endpoint_id uuid)
returns void as $$
  update public.webhook_endpoints
  set invocation_count = invocation_count + 1,
      last_invoked_at = now()
  where id = endpoint_id;
$$ language sql;
