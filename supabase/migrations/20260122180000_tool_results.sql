create type tool_result_status as enum ('MATERIALIZED', 'FAILED', 'PENDING');

create table if not exists public.tool_results (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references public.projects(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  schema_json jsonb not null default '{}'::jsonb,
  records_json jsonb not null default '[]'::jsonb,
  record_count integer not null default 0,
  status tool_result_status not null default 'PENDING',
  error_log jsonb,
  materialized_at timestamptz not null default now()
);

create index idx_tool_results_tool_id on public.tool_results(tool_id);
create index idx_tool_results_org_id on public.tool_results(org_id);

alter table public.tool_results enable row level security;

create policy "Users can view tool results for their org"
  on public.tool_results for select
  using (
    exists (
      select 1 from public.memberships
      where org_id = tool_results.org_id
      and user_id = auth.uid()
    )
  );
