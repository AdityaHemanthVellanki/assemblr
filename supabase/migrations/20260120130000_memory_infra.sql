create table if not exists public.session_memory (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  user_id uuid references public.users(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete cascade,
  namespace text not null,
  key text not null,
  value jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (session_id, namespace, key)
);

create index if not exists session_memory_session_id_idx on public.session_memory (session_id);
create index if not exists session_memory_user_id_idx on public.session_memory (user_id);
create index if not exists session_memory_org_id_idx on public.session_memory (org_id);

alter table public.session_memory enable row level security;

create policy "Users can view session memory"
on public.session_memory for select
to authenticated
using (
  (user_id is not null and user_id = auth.uid())
  or (
    org_id is not null and exists (
      select 1 from public.memberships m
      where m.org_id = session_memory.org_id
      and m.user_id = auth.uid()
    )
  )
);

create policy "Users can manage session memory"
on public.session_memory for all
to authenticated
using (
  (user_id is not null and user_id = auth.uid())
  or (
    org_id is not null and exists (
      select 1 from public.memberships m
      where m.org_id = session_memory.org_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'editor')
    )
  )
);

alter table public.tool_memory add column if not exists id uuid;
alter table public.tool_memory drop constraint if exists tool_memory_pkey;
alter table public.tool_memory alter column org_id drop not null;
update public.tool_memory set id = gen_random_uuid() where id is null;
alter table public.tool_memory alter column id set default gen_random_uuid();
alter table public.tool_memory alter column id set not null;
alter table public.tool_memory add constraint tool_memory_pkey primary key (id);
alter table public.tool_memory drop constraint if exists tool_memory_unique_key;

create unique index if not exists tool_memory_tool_scope_idx
  on public.tool_memory (tool_id, namespace, key)
  where org_id is null and user_id is null;

create unique index if not exists tool_memory_user_scope_idx
  on public.tool_memory (tool_id, user_id, namespace, key)
  where user_id is not null and org_id is null;

create unique index if not exists tool_memory_org_scope_idx
  on public.tool_memory (tool_id, org_id, namespace, key)
  where org_id is not null and user_id is null;

create index if not exists tool_memory_tool_id_idx on public.tool_memory (tool_id);
create index if not exists tool_memory_user_id_idx on public.tool_memory (user_id);
create index if not exists tool_memory_org_id_idx on public.tool_memory (org_id);

create table if not exists public.user_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  namespace text not null,
  key text not null,
  value jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, namespace, key)
);

create index if not exists user_memory_user_id_idx on public.user_memory (user_id);

alter table public.user_memory enable row level security;

create policy "Users can view user memory"
on public.user_memory for select
to authenticated
using (user_id = auth.uid());

create policy "Users can manage user memory"
on public.user_memory for all
to authenticated
using (user_id = auth.uid());

create table if not exists public.org_memory (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  namespace text not null,
  key text not null,
  value jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (org_id, namespace, key)
);

create index if not exists org_memory_org_id_idx on public.org_memory (org_id);

alter table public.org_memory enable row level security;

create policy "Users can view org memory"
on public.org_memory for select
to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.org_id = org_memory.org_id
    and m.user_id = auth.uid()
  )
);

create policy "Users can manage org memory"
on public.org_memory for all
to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.org_id = org_memory.org_id
    and m.user_id = auth.uid()
    and m.role in ('owner', 'editor')
  )
);
