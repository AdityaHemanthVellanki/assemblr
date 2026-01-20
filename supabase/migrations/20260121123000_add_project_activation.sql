alter table public.projects
add column if not exists is_activated boolean not null default false;
