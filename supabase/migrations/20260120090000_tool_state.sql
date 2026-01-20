create table if not exists public.tool_states (
  tool_id uuid not null references public.projects(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (org_id, tool_id)
);

alter table public.tool_states enable row level security;

create policy "Users can view tool states of their org"
on public.tool_states for select
to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.org_id = tool_states.org_id
    and m.user_id = auth.uid()
  )
);

create policy "Users can manage tool states of their org"
on public.tool_states for all
to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.org_id = tool_states.org_id
    and m.user_id = auth.uid()
    and m.role in ('owner', 'editor')
  )
);
