-- Fix projects_delete_editor policy to handle case-sensitivity robustly
drop policy if exists projects_delete_editor on public.projects;

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
      and lower(me.role::text) in ('owner', 'editor')
  )
);

-- Fix projects_update_editor policy to handle case-sensitivity robustly
drop policy if exists projects_update_editor on public.projects;

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
      and lower(me.role::text) in ('owner', 'editor')
  )
)
with check (
  exists (
    select 1
    from public.memberships me
    where me.org_id = projects.org_id
      and me.user_id = auth.uid()
      and lower(me.role::text) in ('owner', 'editor')
  )
);
