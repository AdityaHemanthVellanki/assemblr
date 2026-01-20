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

-- Fix for missing columns if table already exists (e.g. from partial migration)
do $$
begin
  -- Add org_id if missing
  if not exists (select 1 from information_schema.columns where table_name = 'tool_versions' and column_name = 'org_id') then
    alter table public.tool_versions add column org_id uuid references public.organizations(id) on delete cascade;
    -- Try to populate org_id from project
    update public.tool_versions tv set org_id = p.org_id from public.projects p where tv.tool_id = p.id;
    -- If successful, set not null
    if not exists (select 1 from public.tool_versions where org_id is null) then
      alter table public.tool_versions alter column org_id set not null;
    end if;
  end if;

  -- Add status if missing
  if not exists (select 1 from information_schema.columns where table_name = 'tool_versions' and column_name = 'status') then
    alter table public.tool_versions add column status text check (status in ('draft', 'active', 'archived'));
    update public.tool_versions set status = 'draft' where status is null;
    alter table public.tool_versions alter column status set not null;
  end if;
end $$;

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

create index if not exists tool_versions_tool_id_idx on public.tool_versions(tool_id);
create index if not exists tool_versions_org_id_idx on public.tool_versions(org_id);
create index if not exists tool_versions_status_idx on public.tool_versions(status);
create index if not exists tool_versions_created_at_idx on public.tool_versions(created_at desc);
create index if not exists tool_versions_tool_status_idx on public.tool_versions(tool_id, status);
create index if not exists tool_versions_org_status_created_idx
  on public.tool_versions(org_id, status, created_at desc);
create unique index if not exists tool_versions_active_unique
  on public.tool_versions(tool_id)
  where status = 'active';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tool_versions_set_updated_at
before update on public.tool_versions
for each row execute function public.set_updated_at();

alter table public.projects
  add column if not exists active_version_id uuid references public.tool_versions(id) on delete set null;
