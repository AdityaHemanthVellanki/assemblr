create table if not exists public.tool_memory (
  tool_id uuid not null references public.projects(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  namespace text not null,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (org_id, tool_id, namespace, key, user_id)
);

alter table public.tool_memory enable row level security;

create policy "Users can view tool memory of their org"
on public.tool_memory for select
to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.org_id = tool_memory.org_id
    and m.user_id = auth.uid()
  )
);

create policy "Users can manage tool memory of their org"
on public.tool_memory for all
to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.org_id = tool_memory.org_id
    and m.user_id = auth.uid()
    and m.role in ('owner', 'editor')
  )
);
