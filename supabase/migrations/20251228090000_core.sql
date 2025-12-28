create type public.org_role as enum ('OWNER', 'EDITOR', 'VIEWER');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  current_org_id uuid references public.organizations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  role public.org_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, org_id)
);

create table public.data_sources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  type text not null,
  name text not null,
  config jsonb not null,
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  data_source_id uuid references public.data_sources(id) on delete set null,
  spec jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role public.org_role not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by_user_id uuid references auth.users(id) on delete set null
);

create index invites_org_id_idx on public.invites(org_id);
create index invites_email_idx on public.invites(email);
create index memberships_org_id_idx on public.memberships(org_id);
create index memberships_user_id_idx on public.memberships(user_id);
create index projects_org_id_idx on public.projects(org_id);
create index data_sources_org_id_idx on public.data_sources(org_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.projects enable row level security;
alter table public.data_sources enable row level security;
alter table public.invites enable row level security;

create policy organizations_select
on public.organizations
for select
to authenticated
using (
  exists (
    select 1
    from public.memberships m
    where m.org_id = organizations.id
      and m.user_id = auth.uid()
  )
);

create policy profiles_select_own
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy profiles_insert_own
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

create policy profiles_update_own
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy memberships_select_in_org
on public.memberships
for select
to authenticated
using (
  exists (
    select 1
    from public.memberships me
    where me.org_id = memberships.org_id
      and me.user_id = auth.uid()
  )
);

create policy memberships_update_owner
on public.memberships
for update
to authenticated
using (
  exists (
    select 1
    from public.memberships me
    where me.org_id = memberships.org_id
      and me.user_id = auth.uid()
      and me.role = 'OWNER'
  )
)
with check (
  exists (
    select 1
    from public.memberships me
    where me.org_id = memberships.org_id
      and me.user_id = auth.uid()
      and me.role = 'OWNER'
  )
);

create policy memberships_delete_owner
on public.memberships
for delete
to authenticated
using (
  exists (
    select 1
    from public.memberships me
    where me.org_id = memberships.org_id
      and me.user_id = auth.uid()
      and me.role = 'OWNER'
  )
);

create policy projects_select_in_org
on public.projects
for select
to authenticated
using (
  exists (
    select 1
    from public.memberships me
    where me.org_id = projects.org_id
      and me.user_id = auth.uid()
  )
);

create policy projects_insert_editor
on public.projects
for insert
to authenticated
with check (
  exists (
    select 1
    from public.memberships me
    where me.org_id = projects.org_id
      and me.user_id = auth.uid()
      and me.role in ('OWNER', 'EDITOR')
  )
);

create policy projects_update_editor
on public.projects
for update
to authenticated
using (
  exists (
    select 1
    from public.memberships me
    where me.org_id = projects.org_id
      and me.user_id = auth.uid()
      and me.role in ('OWNER', 'EDITOR')
  )
)
with check (
  exists (
    select 1
    from public.memberships me
    where me.org_id = projects.org_id
      and me.user_id = auth.uid()
      and me.role in ('OWNER', 'EDITOR')
  )
);

create policy projects_delete_editor
on public.projects
for delete
to authenticated
using (
  exists (
    select 1
    from public.memberships me
    where me.org_id = projects.org_id
      and me.user_id = auth.uid()
      and me.role in ('OWNER', 'EDITOR')
  )
);

create policy data_sources_select_in_org
on public.data_sources
for select
to authenticated
using (
  exists (
    select 1
    from public.memberships me
    where me.org_id = data_sources.org_id
      and me.user_id = auth.uid()
  )
);

create policy data_sources_owner_write
on public.data_sources
for all
to authenticated
using (
  exists (
    select 1
    from public.memberships me
    where me.org_id = data_sources.org_id
      and me.user_id = auth.uid()
      and me.role = 'OWNER'
  )
)
with check (
  exists (
    select 1
    from public.memberships me
    where me.org_id = data_sources.org_id
      and me.user_id = auth.uid()
      and me.role = 'OWNER'
  )
);

create policy invites_owner_select
on public.invites
for select
to authenticated
using (
  exists (
    select 1
    from public.memberships me
    where me.org_id = invites.org_id
      and me.user_id = auth.uid()
      and me.role = 'OWNER'
  )
);

create policy invites_owner_insert
on public.invites
for insert
to authenticated
with check (
  exists (
    select 1
    from public.memberships me
    where me.org_id = invites.org_id
      and me.user_id = auth.uid()
      and me.role = 'OWNER'
  )
);

create or replace function public.accept_invite(p_token_hash text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite record;
  v_user_id uuid;
  v_email text;
  v_old_org uuid;
  v_old_role public.org_role;
  v_owner_count integer;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'unauthorized';
  end if;

  v_email := auth.jwt() ->> 'email';
  if v_email is null then
    raise exception 'user_missing_email';
  end if;

  select *
  into v_invite
  from public.invites
  where token_hash = p_token_hash
  limit 1;

  if not found or v_invite.accepted_at is not null then
    raise exception 'invite_not_found';
  end if;

  if v_invite.expires_at < now() then
    raise exception 'invite_expired';
  end if;

  if lower(v_invite.email) <> lower(v_email) then
    raise exception 'invite_email_mismatch';
  end if;

  select current_org_id
  into v_old_org
  from public.profiles
  where id = v_user_id;

  if v_old_org is not null and v_old_org <> v_invite.org_id then
    select role
    into v_old_role
    from public.memberships
    where user_id = v_user_id and org_id = v_old_org;

    if v_old_role = 'OWNER' then
      select count(*)
      into v_owner_count
      from public.memberships
      where org_id = v_old_org and role = 'OWNER';

      if v_owner_count = 1 then
        raise exception 'cannot_leave_last_owner';
      end if;
    end if;

    delete from public.memberships
    where user_id = v_user_id and org_id = v_old_org;
  end if;

  insert into public.profiles (id, email, current_org_id)
  values (v_user_id, v_email, v_invite.org_id)
  on conflict (id) do update
  set email = excluded.email,
      current_org_id = excluded.current_org_id;

  insert into public.memberships (user_id, org_id, role)
  values (v_user_id, v_invite.org_id, v_invite.role)
  on conflict (user_id, org_id) do update
  set role = excluded.role;

  update public.invites
  set accepted_at = now(),
      accepted_by_user_id = v_user_id
  where id = v_invite.id;
end;
$$;

grant execute on function public.accept_invite(text) to authenticated;

