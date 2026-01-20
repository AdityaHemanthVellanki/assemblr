create table if not exists public.tool_versions (
  id uuid default gen_random_uuid() primary key,
  tool_id uuid not null references public.projects(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  status text not null check (status in ('draft', 'active', 'archived')),
  name text not null,
  purpose text not null,
  tool_spec jsonb not null default '{}'::jsonb,
  compiled_tool jsonb not null default '{}'::jsonb,
  diff jsonb,
  compiled_intent jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.tool_versions enable row level security;

create policy "Users can view tool versions of their org"
on public.tool_versions for select
to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.org_id = tool_versions.org_id
    and m.user_id = auth.uid()
  )
);

create policy "Users can manage tool versions of their org"
on public.tool_versions for all
to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.org_id = tool_versions.org_id
    and m.user_id = auth.uid()
    and m.role in ('owner', 'editor')
  )
);

alter table public.projects
  add column if not exists active_version_id uuid references public.tool_versions(id) on delete set null;
