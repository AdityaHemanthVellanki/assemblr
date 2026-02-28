-- Seeder Engine: sandbox flag + execution tracking tables
-- This migration adds infrastructure for the Integration Seeder Engine.

-- 1. Add sandbox flag to organizations
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS is_sandbox boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.is_sandbox
  IS 'When true, this org is a sandbox for seeder/demo use only. Seeder engine refuses to run against non-sandbox orgs.';

-- 2. Seeder execution tracking (idempotency)
CREATE TABLE IF NOT EXISTS public.seeder_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scenario_name text NOT NULL,
  execution_hash text NOT NULL,
  status text NOT NULL DEFAULT 'running',  -- running | completed | failed | cleaned
  resource_count int NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,

  CONSTRAINT seeder_execution_status_check CHECK (status IN ('running', 'completed', 'failed', 'cleaned'))
);

CREATE INDEX IF NOT EXISTS idx_seeder_executions_org ON public.seeder_executions(org_id);
CREATE INDEX IF NOT EXISTS idx_seeder_executions_hash ON public.seeder_executions(execution_hash);

-- 3. Seeder execution log (per-action audit trail)
CREATE TABLE IF NOT EXISTS public.seeder_execution_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL REFERENCES public.seeder_executions(id) ON DELETE CASCADE,
  integration text NOT NULL,
  action text NOT NULL,
  composio_action text NOT NULL,
  external_resource_id text,
  external_resource_type text,
  input_payload jsonb,
  output_summary jsonb,
  status text NOT NULL DEFAULT 'pending',  -- pending | success | error | cleaned
  error_message text,
  duration_ms int,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT seeder_log_status_check CHECK (status IN ('pending', 'success', 'error', 'cleaned'))
);

CREATE INDEX IF NOT EXISTS idx_seeder_logs_execution ON public.seeder_execution_logs(execution_id);
CREATE INDEX IF NOT EXISTS idx_seeder_logs_resource ON public.seeder_execution_logs(external_resource_id);

-- 4. RLS policies (admin-only access via service role)
ALTER TABLE public.seeder_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seeder_execution_logs ENABLE ROW LEVEL SECURITY;

-- Only service role (admin) can access seeder tables
CREATE POLICY seeder_executions_admin ON public.seeder_executions
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY seeder_execution_logs_admin ON public.seeder_execution_logs
  FOR ALL USING (auth.role() = 'service_role');
