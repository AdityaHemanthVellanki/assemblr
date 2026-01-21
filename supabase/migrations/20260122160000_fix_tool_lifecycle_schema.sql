
-- Add status and owner_id to projects (tools) table to support strict lifecycle
alter table public.projects 
  add column if not exists status text check (status in ('draft', 'ready', 'error', 'active', 'archived')) default 'draft',
  add column if not exists owner_id uuid references auth.users(id) on delete set null;

-- Backfill status based on is_activated
update public.projects set status = 'active' where is_activated = true;
update public.projects set status = 'draft' where status is null;

-- Add index for performance
create index if not exists projects_status_idx on public.projects(status);
create index if not exists projects_owner_id_idx on public.projects(owner_id);

-- Ensure projects are queryable by owner if not in org (optional, but good for safety)
-- Existing RLS covers org members.
