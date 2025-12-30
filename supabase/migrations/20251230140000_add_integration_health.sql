CREATE TABLE IF NOT EXISTS public.integration_health (
  integration_id text NOT NULL,
  org_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('ok', 'error')),
  error_message text,
  error_code text,
  latency_ms integer,
  last_checked_at timestamptz DEFAULT now(),
  PRIMARY KEY (org_id, integration_id),
  CONSTRAINT fk_integration_connection
    FOREIGN KEY (org_id, integration_id)
    REFERENCES public.integration_connections (org_id, integration_id)
    ON DELETE CASCADE
);

ALTER TABLE public.integration_health ENABLE ROW LEVEL SECURITY;

drop policy if exists "Users can view health of their org's integrations" on public.integration_health;
drop policy if exists "System can update health" on public.integration_health;

create policy "read integration health"
on public.integration_health
for select
to authenticated
using (
  exists (
    select 1
    from public.memberships m
    where m.org_id = integration_health.org_id
      and m.user_id = auth.uid()
  )
);

create policy "modify integration health"
on public.integration_health
for all
to authenticated
using (
  exists (
    select 1
    from public.memberships m
    where m.org_id = integration_health.org_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'editor')
  )
)
with check (
  exists (
    select 1
    from public.memberships m
    where m.org_id = integration_health.org_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'editor')
  )
);

grant select, insert, update, delete on table public.integration_health to authenticated;
grant select, insert, update, delete on table public.integration_health to service_role;
