create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references public.projects(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz not null default now()
);

create index chat_messages_tool_id_idx on public.chat_messages(tool_id);
create index chat_messages_org_id_idx on public.chat_messages(org_id);

alter table public.chat_messages enable row level security;

-- READ: All org members can read chat history (if they can read the project)
create policy chat_messages_select
on public.chat_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.memberships m
    where m.org_id = chat_messages.org_id
      and m.user_id = auth.uid()
  )
  and exists (
    select 1
    from public.projects p
    where p.id = chat_messages.tool_id
      and p.org_id = chat_messages.org_id
  )
);

-- INSERT: Only Owners/Editors can chat (because it modifies the tool)
create policy chat_messages_insert
on public.chat_messages
for insert
to authenticated
with check (
  exists (
    select 1
    from public.memberships m
    where m.org_id = chat_messages.org_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'editor')
  )
  and exists (
    select 1
    from public.projects p
    where p.id = chat_messages.tool_id
      and p.org_id = chat_messages.org_id
  )
);
