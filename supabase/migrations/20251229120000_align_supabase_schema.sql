alter type public.org_role rename value 'OWNER' to 'owner';
alter type public.org_role rename value 'EDITOR' to 'editor';
alter type public.org_role rename value 'VIEWER' to 'viewer';

alter table public.organizations rename to orgs;
alter table public.profiles rename to users;

drop policy if exists organizations_select on public.orgs;
drop policy if exists organizations_update_owner on public.orgs;

drop policy if exists profiles_select_own on public.users;
drop policy if exists profiles_select_in_org on public.users;
drop policy if exists profiles_insert_own on public.users;
drop policy if exists profiles_update_own on public.users;

drop policy if exists memberships_select_in_org on public.memberships;
drop policy if exists memberships_update_owner on public.memberships;
drop policy if exists memberships_delete_owner on public.memberships;

drop policy if exists projects_select_in_org on public.projects;
drop policy if exists projects_insert_editor on public.projects;
drop policy if exists projects_update_editor on public.projects;
drop policy if exists projects_delete_editor on public.projects;

drop policy if exists data_sources_select_in_org on public.data_sources;
drop policy if exists data_sources_owner_write on public.data_sources;

drop policy if exists invites_owner_select on public.invites;
drop policy if exists invites_owner_insert on public.invites;

create policy users_select_own
on public.users
for select
to authenticated
using (id = auth.uid());

create policy users_insert_own
on public.users
for insert
to authenticated
with check (id = auth.uid());

create policy users_update_own
on public.users
for update
to authenticated
using (id = auth.uid())
with check (
  id = auth.uid()
  and (
    current_org_id is null
    or exists (
      select 1
      from public.memberships m
      where m.user_id = auth.uid()
        and m.org_id = users.current_org_id
    )
  )
);

create policy orgs_select_in_org
on public.orgs
for select
to authenticated
using (
  exists (
    select 1
    from public.memberships m
    where m.org_id = orgs.id
      and m.user_id = auth.uid()
  )
);

create policy orgs_update_owner
on public.orgs
for update
to authenticated
using (
  exists (
    select 1
    from public.memberships m
    where m.org_id = orgs.id
      and m.user_id = auth.uid()
      and m.role = 'owner'
  )
)
with check (
  exists (
    select 1
    from public.memberships m
    where m.org_id = orgs.id
      and m.user_id = auth.uid()
      and m.role = 'owner'
  )
);

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

create policy memberships_insert_owner
on public.memberships
for insert
to authenticated
with check (
  exists (
    select 1
    from public.memberships me
    where me.org_id = memberships.org_id
      and me.user_id = auth.uid()
      and me.role = 'owner'
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
      and me.role = 'owner'
  )
)
with check (
  exists (
    select 1
    from public.memberships me
    where me.org_id = memberships.org_id
      and me.user_id = auth.uid()
      and me.role = 'owner'
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
      and me.role = 'owner'
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
      and me.role in ('owner', 'editor')
  )
  and (
    projects.data_source_id is null
    or exists (
      select 1
      from public.data_sources ds
      where ds.id = projects.data_source_id
        and ds.org_id = projects.org_id
    )
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
      and me.role in ('owner', 'editor')
  )
)
with check (
  exists (
    select 1
    from public.memberships me
    where me.org_id = projects.org_id
      and me.user_id = auth.uid()
      and me.role in ('owner', 'editor')
  )
  and (
    projects.data_source_id is null
    or exists (
      select 1
      from public.data_sources ds
      where ds.id = projects.data_source_id
        and ds.org_id = projects.org_id
    )
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
      and me.role in ('owner', 'editor')
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
      and me.role = 'owner'
  )
)
with check (
  exists (
    select 1
    from public.memberships me
    where me.org_id = data_sources.org_id
      and me.user_id = auth.uid()
      and me.role = 'owner'
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
      and me.role = 'owner'
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
      and me.role = 'owner'
  )
);

create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_domain text;
  v_name text;
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do update
  set email = excluded.email;

  v_domain := split_part(coalesce(new.email, ''), '@', 2);
  v_name := case when length(trim(v_domain)) > 0 then trim(v_domain) else 'Personal' end;

  insert into public.orgs (name)
  values (v_name)
  returning id into v_org_id;

  insert into public.memberships (user_id, org_id, role)
  values (new.id, v_org_id, 'owner');

  update public.users
  set current_org_id = v_org_id
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_auth_user_created();

create or replace function public.bootstrap_user()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_email text;
  v_existing_org uuid;
  v_org_id uuid;
  v_domain text;
  v_name text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'unauthorized';
  end if;

  v_email := auth.jwt() ->> 'email';

  select current_org_id
  into v_existing_org
  from public.users
  where id = v_user_id;

  if v_existing_org is not null then
    return v_existing_org;
  end if;

  insert into public.users (id, email)
  values (v_user_id, v_email)
  on conflict (id) do update
  set email = excluded.email;

  v_domain := split_part(coalesce(v_email, ''), '@', 2);
  v_name := case when length(trim(v_domain)) > 0 then trim(v_domain) else 'Personal' end;

  insert into public.orgs (name)
  values (v_name)
  returning id into v_org_id;

  insert into public.memberships (user_id, org_id, role)
  values (v_user_id, v_org_id, 'owner');

  update public.users
  set current_org_id = v_org_id
  where id = v_user_id;

  return v_org_id;
end;
$$;

grant execute on function public.bootstrap_user() to authenticated;

create or replace function public.org_has_member_email(p_org_id uuid, p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  if not exists (
    select 1
    from public.memberships m
    where m.org_id = p_org_id
      and m.user_id = auth.uid()
      and m.role = 'owner'
  ) then
    raise exception 'forbidden';
  end if;

  return exists (
    select 1
    from public.memberships m
    join public.users u on u.id = m.user_id
    where m.org_id = p_org_id
      and lower(u.email) = lower(p_email)
  );
end;
$$;

grant execute on function public.org_has_member_email(uuid, text) to authenticated;

create or replace function public.list_org_members(p_org_id uuid)
returns table (
  user_id uuid,
  role public.org_role,
  created_at timestamptz,
  email text,
  name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  if not exists (
    select 1
    from public.memberships m
    where m.org_id = p_org_id
      and m.user_id = auth.uid()
  ) then
    raise exception 'forbidden';
  end if;

  return query
  select m.user_id, m.role, m.created_at, u.email, u.name
  from public.memberships m
  left join public.users u on u.id = m.user_id
  where m.org_id = p_org_id
  order by m.created_at asc;
end;
$$;

grant execute on function public.list_org_members(uuid) to authenticated;

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

  insert into public.users (id, email, current_org_id)
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
