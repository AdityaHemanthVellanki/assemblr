do $$
begin
  if exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'chat_messages'
      and c.conname = 'chat_messages_tool_id_fkey'
  ) then
    alter table public.chat_messages
      drop constraint chat_messages_tool_id_fkey;
  end if;
end $$;

alter table if exists public.chat_messages
  add constraint chat_messages_tool_id_fkey
  foreign key (tool_id)
  references public.projects(id)
  on delete cascade;

