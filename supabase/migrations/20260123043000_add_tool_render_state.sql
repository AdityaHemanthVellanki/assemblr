CREATE TABLE IF NOT EXISTS public.tool_render_state (
  tool_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  integration_data jsonb NOT NULL,
  snapshot jsonb NOT NULL,
  view_spec jsonb NOT NULL,
  data_ready boolean NOT NULL DEFAULT true,
  view_ready boolean NOT NULL DEFAULT true,
  finalized_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS tool_render_state_org_idx
  ON public.tool_render_state(org_id);

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
  IF p_integration_data IS NULL OR (jsonb_typeof(p_integration_data) = 'object' AND NOT EXISTS (SELECT 1 FROM jsonb_each(p_integration_data))) THEN
    RAISE EXCEPTION 'Integration data empty — abort finalize';
  END IF;

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
    p_integration_data,
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
    status = 'READY',
    finalized_at = p_finalized_at,
    lifecycle_done = true,
    error_message = null
  WHERE id = p_tool_id;
  GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  IF v_rowcount = 0 THEN
    RAISE EXCEPTION 'Finalize failed to update projects row for tool_id %', p_tool_id;
  END IF;
END;
$$;
