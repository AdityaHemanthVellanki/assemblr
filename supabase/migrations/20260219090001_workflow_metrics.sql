-- Workflow / action / trigger metrics for observability
create table if not exists public.workflow_metrics (
  id uuid default gen_random_uuid() primary key,
  org_id uuid not null,
  tool_id uuid not null,
  metric_name text not null,
  metric_value numeric not null,
  dimensions jsonb default '{}'::jsonb,
  recorded_at timestamptz default now()
);

create index idx_wf_metrics_tool on public.workflow_metrics(tool_id, recorded_at desc);
create index idx_wf_metrics_name on public.workflow_metrics(tool_id, metric_name, recorded_at desc);
