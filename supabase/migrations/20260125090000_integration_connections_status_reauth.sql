alter table public.integration_connections
  drop constraint if exists integration_connections_status_check;

alter table public.integration_connections
  add constraint integration_connections_status_check
  check (status in ('active', 'pending', 'pending_setup', 'error', 'reauth_required'));
