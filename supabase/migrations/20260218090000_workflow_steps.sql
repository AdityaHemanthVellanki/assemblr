-- Step-level execution persistence for workflow resumability
create table if not exists public.workflow_steps (
  id uuid default gen_random_uuid() primary key,
  run_id uuid not null,
  node_id text not null,
  action_id text,
  status text not null default 'pending'
    check (status in ('pending','running','completed','failed','skipped','blocked')),
  input jsonb default '{}'::jsonb,
  output jsonb,
  error text,
  retries integer default 0,
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms integer,
  created_at timestamptz default now()
);

create index if not exists idx_wf_steps_run on public.workflow_steps(run_id);
create index if not exists idx_wf_steps_status on public.workflow_steps(status);
