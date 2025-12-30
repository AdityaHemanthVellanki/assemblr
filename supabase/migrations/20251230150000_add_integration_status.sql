
alter table public.integration_connections 
add column if not exists status text not null default 'active' check (status in ('active', 'pending_setup', 'error'));

-- Default existing rows to active (implied by default)
