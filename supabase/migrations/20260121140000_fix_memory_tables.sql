-- Ensure core memory tables exist and are correct
create table if not exists public.tool_memory (
  tool_id uuid not null references public.projects(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  namespace text not null,
  key text not null,
  value jsonb,
  updated_at timestamptz default now(),
  primary key (tool_id, namespace, key)
);

create table if not exists public.session_memory (
  session_id text not null,
  namespace text not null,
  key text not null,
  value jsonb,
  updated_at timestamptz default now(),
  primary key (session_id, namespace, key)
);

create table if not exists public.user_memory (
  user_id uuid not null references auth.users(id) on delete cascade,
  namespace text not null,
  key text not null,
  value jsonb,
  updated_at timestamptz default now(),
  primary key (user_id, namespace, key)
);

create table if not exists public.org_memory (
  org_id uuid not null references public.organizations(id) on delete cascade,
  namespace text not null,
  key text not null,
  value jsonb,
  updated_at timestamptz default now(),
  primary key (org_id, namespace, key)
);

-- Specialized tables for high-volume/critical data (User Requirement 1)
create table if not exists public.tool_build_logs (
  tool_id uuid not null references public.projects(id) on delete cascade,
  build_id text not null,
  logs jsonb not null default '[]'::jsonb,
  updated_at timestamptz default now(),
  primary key (tool_id, build_id)
);

create table if not exists public.tool_lifecycle_state (
  tool_id uuid not null references public.projects(id) on delete cascade,
  state text not null,
  details jsonb,
  updated_at timestamptz default now(),
  primary key (tool_id)
);

create table if not exists public.tool_token_usage (
  tool_id uuid not null references public.projects(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  period_start timestamptz not null,
  tokens_used bigint not null default 0,
  updated_at timestamptz default now(),
  primary key (tool_id, period_start)
);

-- Indexes for performance
create index if not exists idx_tool_memory_lookup on public.tool_memory(tool_id, namespace, key);
create index if not exists idx_session_memory_lookup on public.session_memory(session_id, namespace, key);

-- Enable RLS
alter table public.tool_memory enable row level security;
alter table public.session_memory enable row level security;
alter table public.user_memory enable row level security;
alter table public.org_memory enable row level security;
alter table public.tool_build_logs enable row level security;
alter table public.tool_lifecycle_state enable row level security;
alter table public.tool_token_usage enable row level security;

-- Policies (Permissive for now, relying on service role for critical ops, but good to have)
create policy "Enable read access for all users" on public.tool_memory for select using (true);
create policy "Enable insert for authenticated users only" on public.tool_memory for insert with check (auth.role() = 'authenticated');
create policy "Enable update for authenticated users only" on public.tool_memory for update using (auth.role() = 'authenticated');
