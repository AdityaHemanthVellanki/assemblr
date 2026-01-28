-- Safe cascade delete function for projects
-- Handles cleaning up all related data even if foreign keys are missing ON DELETE CASCADE
-- Enforces strict permission checks (Owner/Editor only)

create or replace function public.delete_project_cascade(
  p_project_id uuid,
  p_org_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  -- 1. Check Permissions
  -- Must be a member of the org with 'owner' or 'editor' role
  select role into v_role
  from public.memberships
  where org_id = p_org_id
    and user_id = auth.uid();

  if v_role is null or v_role not in ('owner', 'editor') then
    raise exception 'Permission denied: User must be an owner or editor of the organization.';
  end if;

  -- 2. Verify Project Exists & Belongs to Org
  if not exists (select 1 from public.projects where id = p_project_id and org_id = p_org_id) then
    raise exception 'Project not found in this organization.';
  end if;

  -- 3. Delete Related Data (Explicit Cascade)
  -- This ensures cleanup even if FKs are missing ON DELETE CASCADE
  
  -- Tool Execution / Runtime Data
  delete from public.tool_states where tool_id = p_project_id;
  delete from public.tool_lifecycle_state where tool_id = p_project_id;
  delete from public.tool_build_logs where tool_id = p_project_id;
  delete from public.tool_render_state where tool_id = p_project_id;
  delete from public.tool_results where tool_id = p_project_id;
  delete from public.tool_token_usage where tool_id = p_project_id;
  delete from public.tool_memory where tool_id = p_project_id;
  
  -- Chat & Collaboration
  delete from public.chat_messages where tool_id = p_project_id;
  delete from public.tool_shares where tool_id = p_project_id;
  
  -- Versioning
  delete from public.tool_versions where tool_id = p_project_id;

  -- 4. Delete the Project itself
  delete from public.projects where id = p_project_id and org_id = p_org_id;

end;
$$;
