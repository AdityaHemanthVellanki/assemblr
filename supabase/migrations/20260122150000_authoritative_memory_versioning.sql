create table if not exists public.tool_versions (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references public.projects(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references auth.users(id),
  status text not null check (status in ('draft', 'active', 'archived')),
  name text not null,
  purpose text not null,
  tool_spec jsonb not null default '{}'::jsonb,
  compiled_tool jsonb not null default '{}'::jsonb,
  intent_schema jsonb,
  diff jsonb,
  build_hash text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.tool_versions add column if not exists created_by uuid references auth.users(id);
alter table public.tool_versions add column if not exists name text;
alter table public.tool_versions add column if not exists purpose text;
alter table public.tool_versions add column if not exists status text;
alter table public.tool_versions add column if not exists compiled_tool jsonb;
alter table public.tool_versions add column if not exists intent_schema jsonb;
alter table public.tool_versions add column if not exists tool_spec jsonb;
alter table public.tool_versions add column if not exists diff jsonb;
alter table public.tool_versions add column if not exists build_hash text;
alter table public.tool_versions add column if not exists created_at timestamptz default now();
alter table public.tool_versions add column if not exists updated_at timestamptz default now();
update public.tool_versions set compiled_tool = '{}'::jsonb where compiled_tool is null;
update public.tool_versions set tool_spec = '{}'::jsonb where tool_spec is null;
update public.tool_versions set build_hash = md5(tool_spec::text || id::text) where build_hash is null;
create unique index if not exists tool_versions_tool_id_build_hash_key on public.tool_versions(tool_id, build_hash);

alter table public.tool_memory add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table public.tool_memory alter column user_id drop not null;
do $$
begin
  update public.tool_memory set owner_id = coalesce(owner_id, user_id);
  update public.tool_memory tm
  set owner_id = m.user_id
  from public.memberships m
  where tm.owner_id is null
    and tm.org_id = m.org_id
    and m.role = 'owner';
end $$;

create table if not exists public.tool_lifecycle_state (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references public.projects(id) on delete cascade,
  key text not null default 'lifecycle',
  state text not null,
  data jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.tool_lifecycle_state add column if not exists id uuid default gen_random_uuid();
alter table public.tool_lifecycle_state add column if not exists key text;
alter table public.tool_lifecycle_state add column if not exists state text;
alter table public.tool_lifecycle_state add column if not exists data jsonb;
alter table public.tool_lifecycle_state add column if not exists created_at timestamptz default now();
alter table public.tool_lifecycle_state add column if not exists updated_at timestamptz default now();
alter table public.tool_lifecycle_state alter column key set default 'lifecycle';
do $$
declare
  pk_name text;
begin
  select conname into pk_name
  from pg_constraint
  where conrelid = 'public.tool_lifecycle_state'::regclass
    and contype = 'p';
  if pk_name is not null then
    execute format('alter table public.tool_lifecycle_state drop constraint %I', pk_name);
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'tool_lifecycle_state' and column_name = 'id') then
    alter table public.tool_lifecycle_state add column id uuid default gen_random_uuid();
  end if;
  alter table public.tool_lifecycle_state add primary key (id);
end $$;
do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'tool_lifecycle_state' and column_name = 'state') then
    update public.tool_lifecycle_state set key = coalesce(key, 'lifecycle'), state = coalesce(state, 'INIT'), data = coalesce(data, to_jsonb(state)), created_at = coalesce(created_at, updated_at, now()), updated_at = coalesce(updated_at, now());
  else
    update public.tool_lifecycle_state set key = coalesce(key, 'lifecycle'), state = coalesce(state, 'INIT'), data = coalesce(data, data), created_at = coalesce(created_at, now()), updated_at = coalesce(updated_at, now());
  end if;
end $$;
alter table public.tool_lifecycle_state alter column key set not null;
alter table public.tool_lifecycle_state alter column state set not null;
create unique index if not exists tool_lifecycle_state_tool_id_key on public.tool_lifecycle_state(tool_id);
create unique index if not exists tool_lifecycle_unique on public.tool_lifecycle_state(tool_id);

create table if not exists public.tool_build_logs (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references public.projects(id) on delete cascade,
  build_id text not null,
  logs jsonb not null,
  created_at timestamptz default now()
);

alter table public.tool_build_logs add column if not exists id uuid default gen_random_uuid();
alter table public.tool_build_logs add column if not exists build_id text;
alter table public.tool_build_logs add column if not exists logs jsonb;
alter table public.tool_build_logs add column if not exists created_at timestamptz default now();
do $$
declare
  pk_name text;
begin
  select conname into pk_name
  from pg_constraint
  where conrelid = 'public.tool_build_logs'::regclass
    and contype = 'p';
  if pk_name is not null then
    execute format('alter table public.tool_build_logs drop constraint %I', pk_name);
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'tool_build_logs' and column_name = 'id') then
    alter table public.tool_build_logs add column id uuid default gen_random_uuid();
  end if;
  alter table public.tool_build_logs add primary key (id);
end $$;
do $$
begin
  update public.tool_build_logs set build_id = coalesce(build_id, gen_random_uuid()::text);
  if exists (select 1 from information_schema.columns where table_name = 'tool_build_logs' and column_name = 'updated_at') then
    update public.tool_build_logs set logs = coalesce(logs, '[]'::jsonb), created_at = coalesce(created_at, updated_at, now());
  else
    update public.tool_build_logs set logs = coalesce(logs, '[]'::jsonb), created_at = coalesce(created_at, now());
  end if;
end $$;
alter table public.tool_build_logs alter column build_id set not null;
drop index if exists tool_build_logs_tool_id_key;
drop index if exists idx_tool_build_logs_tool;
create unique index if not exists tool_build_logs_tool_build_idx on public.tool_build_logs(tool_id, build_id);
create index if not exists tool_build_logs_build_idx on public.tool_build_logs(build_id);

alter table public.tool_lifecycle_state enable row level security;
alter table public.tool_build_logs enable row level security;

drop policy if exists "Tool lifecycle read" on public.tool_lifecycle_state;
create policy "Tool lifecycle read" on public.tool_lifecycle_state for select to authenticated using (
  exists (
    select 1
    from public.projects p
    join public.memberships m on m.org_id = p.org_id
    where p.id = tool_lifecycle_state.tool_id
      and m.user_id = auth.uid()
  )
);

drop policy if exists "Tool lifecycle write" on public.tool_lifecycle_state;
create policy "Tool lifecycle write" on public.tool_lifecycle_state for insert to authenticated with check (
  exists (
    select 1
    from public.projects p
    join public.memberships m on m.org_id = p.org_id
    where p.id = tool_lifecycle_state.tool_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'editor')
  )
);

drop policy if exists "Tool lifecycle update" on public.tool_lifecycle_state;
create policy "Tool lifecycle update" on public.tool_lifecycle_state for update to authenticated using (
  exists (
    select 1
    from public.projects p
    join public.memberships m on m.org_id = p.org_id
    where p.id = tool_lifecycle_state.tool_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'editor')
  )
);

drop policy if exists "Tool logs read" on public.tool_build_logs;
create policy "Tool logs read" on public.tool_build_logs for select to authenticated using (
  exists (
    select 1
    from public.projects p
    join public.memberships m on m.org_id = p.org_id
    where p.id = tool_build_logs.tool_id
      and m.user_id = auth.uid()
  )
);

drop policy if exists "Tool logs write" on public.tool_build_logs;
create policy "Tool logs write" on public.tool_build_logs for insert to authenticated with check (
  exists (
    select 1
    from public.projects p
    join public.memberships m on m.org_id = p.org_id
    where p.id = tool_build_logs.tool_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'editor')
  )
);

drop policy if exists "Tool logs update" on public.tool_build_logs;
create policy "Tool logs update" on public.tool_build_logs for update to authenticated using (
  exists (
    select 1
    from public.projects p
    join public.memberships m on m.org_id = p.org_id
    where p.id = tool_build_logs.tool_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'editor')
  )
);

NOTIFY pgrst, 'reload schema';
