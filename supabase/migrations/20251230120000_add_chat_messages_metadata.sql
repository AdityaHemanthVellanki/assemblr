alter table public.chat_messages
add column if not exists metadata jsonb;

