alter table public.execution_runs
  add column if not exists input jsonb default '{}'::jsonb;
