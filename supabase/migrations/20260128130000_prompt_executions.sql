create table if not exists public.prompt_executions (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  prompt text not null,
  prompt_hash text not null,
  tool_id uuid references public.projects(id) on delete cascade,
  resume_id uuid,
  status text not null check (status in ('created','awaiting_integration','compiling','compiled','executing','completed','failed')),
  error text,
  normalized_prompt text not null,
  prompt_id uuid,
  tool_version_id uuid references public.tool_versions(id) on delete set null,
  required_integrations text[],
  missing_integrations text[],
  lock_token text,
  lock_acquired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.prompt_executions enable row level security;

create unique index if not exists prompt_executions_tool_prompt_unique
  on public.prompt_executions (tool_id, prompt_hash)
  where status <> 'failed';

create index if not exists prompt_executions_chat_id_idx on public.prompt_executions(chat_id);
create index if not exists prompt_executions_prompt_hash_idx on public.prompt_executions(prompt_hash);
create index if not exists prompt_executions_resume_id_idx on public.prompt_executions(resume_id);

create index if not exists prompt_executions_tool_id_idx on public.prompt_executions(tool_id);
create index if not exists prompt_executions_status_idx on public.prompt_executions(status);

create policy "users can access their own executions"
  on public.prompt_executions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.oauth_resume_contexts
  add column if not exists execution_id uuid references public.prompt_executions(id) on delete set null;
