-- Create join_definitions table
create table if not exists public.join_definitions (
  id uuid default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  
  -- Left Side
  left_integration_id text not null, -- integration type or specific ID if needed
  left_resource text not null,
  left_field text not null,
  
  -- Right Side
  right_integration_id text not null,
  right_resource text not null,
  right_field text not null,
  
  -- Configuration
  join_type text not null default 'inner' check (join_type in ('inner', 'left', 'right')),
  confidence text not null default 'explicit' check (confidence in ('explicit', 'inferred', 'user_confirmed')),
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.join_definitions enable row level security;

-- Policies
create policy "Users can view joins of their org"
on public.join_definitions for select
to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.org_id = join_definitions.org_id
    and m.user_id = auth.uid()
  )
);

create policy "Users can manage joins of their org"
on public.join_definitions for all
to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.org_id = join_definitions.org_id
    and m.user_id = auth.uid()
    and m.role in ('owner', 'editor')
  )
);
