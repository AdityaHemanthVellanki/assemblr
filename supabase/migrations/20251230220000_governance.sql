-- Create audit_logs table
create table if not exists public.audit_logs (
  id uuid default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id), -- Nullable for system actions
  action text not null, -- e.g. 'workflow.create', 'alert.trigger'
  target_resource text not null, -- 'workflow', 'metric'
  target_id text,
  metadata jsonb default '{}'::jsonb,
  timestamp timestamptz default now()
);

-- Update workflows table with governance fields
alter table public.workflows 
add column if not exists approval_status text default 'approved' check (approval_status in ('pending', 'approved', 'rejected')),
add column if not exists requires_approval boolean default false;

-- Create approvals table
create table if not exists public.approvals (
  id uuid default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  requested_by uuid references auth.users(id),
  approved_by uuid references auth.users(id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz default now(),
  resolved_at timestamptz
);

alter table public.audit_logs enable row level security;
alter table public.approvals enable row level security;

-- Policies for Audit Logs (Read-only for users)
create policy "Users can view audit logs of their org"
on public.audit_logs for select
to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.org_id = audit_logs.org_id
    and m.user_id = auth.uid()
  )
);

-- Allow system insertion (via service role or restricted function) - for now allow auth users to insert their own actions
create policy "Users can insert audit logs"
on public.audit_logs for insert
to authenticated
with check (
  exists (
    select 1 from public.memberships m
    where m.org_id = audit_logs.org_id
    and m.user_id = auth.uid()
  )
);

-- Policies for Approvals
create policy "Users can view approvals of their org"
on public.approvals for select
to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.org_id = approvals.org_id
    and m.user_id = auth.uid()
  )
);

create policy "Users can manage approvals of their org"
on public.approvals for all
to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.org_id = approvals.org_id
    and m.user_id = auth.uid()
  )
);
