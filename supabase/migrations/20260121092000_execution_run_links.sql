alter table public.execution_runs
  add column if not exists action_id text;

alter table public.execution_runs
  add column if not exists workflow_id text;
