-- Fix finalize_tool_render_state RPC to write 'MATERIALIZED' instead of 'READY'
-- The 20260210 migration changed the status constraint to use MATERIALIZED,
-- but this RPC (from 20260204) still wrote 'READY' which violates the constraint.
CREATE OR REPLACE FUNCTION public.finalize_tool_render_state(
  p_tool_id uuid,
  p_org_id uuid,
  p_integration_data jsonb,
  p_snapshot jsonb,
  p_view_spec jsonb,
  p_data_ready boolean,
  p_view_ready boolean,
  p_finalized_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_rowcount integer;
BEGIN
  INSERT INTO public.tool_render_state (
    tool_id,
    org_id,
    integration_data,
    snapshot,
    view_spec,
    data_ready,
    view_ready,
    finalized_at
  ) VALUES (
    p_tool_id,
    p_org_id,
    COALESCE(p_integration_data, '{}'::jsonb),
    p_snapshot,
    p_view_spec,
    p_data_ready,
    p_view_ready,
    p_finalized_at
  )
  ON CONFLICT (tool_id) DO UPDATE
  SET
    org_id = EXCLUDED.org_id,
    integration_data = EXCLUDED.integration_data,
    snapshot = EXCLUDED.snapshot,
    view_spec = EXCLUDED.view_spec,
    data_ready = EXCLUDED.data_ready,
    view_ready = EXCLUDED.view_ready,
    finalized_at = EXCLUDED.finalized_at;

  -- FIX: Write MATERIALIZED (not READY) to match projects_status_check constraint
  -- Constraint allows: CREATED, PLANNED, READY_TO_EXECUTE, EXECUTING, MATERIALIZED, FAILED
  UPDATE public.projects
  SET
    data_snapshot = p_snapshot,
    data_ready = p_data_ready,
    view_spec = p_view_spec,
    view_ready = p_view_ready,
    status = CASE WHEN p_view_ready THEN 'MATERIALIZED' ELSE 'FAILED' END,
    finalized_at = p_finalized_at,
    lifecycle_done = true,
    error_message = CASE WHEN p_view_ready THEN null ELSE error_message END
  WHERE id = p_tool_id;
  GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  IF v_rowcount = 0 THEN
    RAISE EXCEPTION 'Finalize failed to update projects row for tool_id %', p_tool_id;
  END IF;
END;
$$;

-- Also create the v2 variant so tool-chat.ts calls succeed directly
-- instead of falling back to manual code
CREATE OR REPLACE FUNCTION public.finalize_tool_render_state_v2(
  p_tool_id uuid,
  p_org_id uuid,
  p_integration_data jsonb,
  p_snapshot jsonb,
  p_view_spec jsonb,
  p_data_ready boolean,
  p_view_ready boolean,
  p_finalized_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_rowcount integer;
BEGIN
  INSERT INTO public.tool_render_state (
    tool_id,
    org_id,
    integration_data,
    snapshot,
    view_spec,
    data_ready,
    view_ready,
    finalized_at
  ) VALUES (
    p_tool_id,
    p_org_id,
    COALESCE(p_integration_data, '{}'::jsonb),
    p_snapshot,
    p_view_spec,
    p_data_ready,
    p_view_ready,
    p_finalized_at
  )
  ON CONFLICT (tool_id) DO UPDATE
  SET
    org_id = EXCLUDED.org_id,
    integration_data = EXCLUDED.integration_data,
    snapshot = EXCLUDED.snapshot,
    view_spec = EXCLUDED.view_spec,
    data_ready = EXCLUDED.data_ready,
    view_ready = EXCLUDED.view_ready,
    finalized_at = EXCLUDED.finalized_at;

  UPDATE public.projects
  SET
    data_snapshot = p_snapshot,
    data_ready = p_data_ready,
    view_spec = p_view_spec,
    view_ready = p_view_ready,
    status = CASE WHEN p_view_ready THEN 'MATERIALIZED' ELSE 'FAILED' END,
    finalized_at = p_finalized_at,
    lifecycle_done = true,
    error_message = CASE WHEN p_view_ready THEN null ELSE error_message END
  WHERE id = p_tool_id;
  GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  IF v_rowcount = 0 THEN
    RAISE EXCEPTION 'Finalize failed to update projects row for tool_id %', p_tool_id;
  END IF;
END;
$$;
