
-- Add status and owner_id to projects (tools) table to support strict lifecycle
alter table public.projects 
  add column if not exists status text check (status in ('DRAFT', 'COMPILING', 'MATERIALIZED', 'ACTIVE', 'FAILED')) default 'DRAFT',
  add column if not exists owner_id uuid references auth.users(id) on delete set null;

-- Backfill status if null
update public.projects set status = 'DRAFT' where status is null;

-- Add index for performance
create index if not exists projects_status_idx on public.projects(status);
create index if not exists projects_owner_id_idx on public.projects(owner_id);

-- Ensure projects are queryable by owner if not in org (optional, but good for safety)
-- Existing RLS covers org members.
