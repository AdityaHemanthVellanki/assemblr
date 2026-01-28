create table if not exists public.oauth_resume_contexts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  
  -- Context
  project_id uuid references public.projects(id) on delete cascade,
  chat_id uuid,
  tool_id uuid,
  
  -- State
  original_prompt text,
  pending_integrations text[],
  blocked_integration text,
  orchestration_state jsonb,
  
  -- Navigation
  return_path text not null,
  
  -- Lifecycle
  created_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '10 minutes')
);

-- RLS
alter table public.oauth_resume_contexts enable row level security;

create policy "Users can view their own resume contexts"
  on public.oauth_resume_contexts for select
  using (auth.uid() = user_id);

create policy "Users can insert their own resume contexts"
  on public.oauth_resume_contexts for insert
  with check (auth.uid() = user_id);

-- Cleanup cron (optional, but good practice. For now, we rely on checking expires_at)
