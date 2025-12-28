drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

create policy profiles_select_in_org
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or exists (
    select 1
    from public.memberships my
    join public.memberships theirs
      on theirs.org_id = my.org_id
    where my.user_id = auth.uid()
      and theirs.user_id = profiles.id
  )
);

create policy profiles_insert_own
on public.profiles
for insert
to authenticated
with check (
  id = auth.uid()
  and current_org_id is null
);

create policy profiles_update_own
on public.profiles
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
        and m.org_id = profiles.current_org_id
    )
  )
);

drop policy if exists projects_insert_editor on public.projects;
drop policy if exists projects_update_editor on public.projects;

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

create policy organizations_update_owner
on public.organizations
for update
to authenticated
using (
  exists (
    select 1
    from public.memberships me
    where me.org_id = organizations.id
      and me.user_id = auth.uid()
      and me.role = 'OWNER'
  )
)
with check (
  exists (
    select 1
    from public.memberships me
    where me.org_id = organizations.id
      and me.user_id = auth.uid()
      and me.role = 'OWNER'
  )
);
