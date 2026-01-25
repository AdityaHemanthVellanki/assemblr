create table if not exists public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  name text,
  email text,
  avatar_url text,
  created_at timestamptz not null default now(),
   updated_at timestamptz not null default now()
 );
 
 insert into public.profiles (id, email)
 select id, email from auth.users
 on conflict (id) do nothing;

 alter table public.profiles enable row level security;

create policy "Users can view their own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "Users can update their own profile" on public.profiles
  for update using (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, email, avatar_url)
  values (new.id, new.raw_user_meta_data->>'full_name', new.email, new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.tool_versions add column if not exists prompt_used text;
alter table public.tool_versions add column if not exists view_spec jsonb;
alter table public.tool_versions add column if not exists data_snapshot jsonb;
alter table public.tool_versions add column if not exists runtime_config jsonb;
alter table public.profiles add column if not exists avatar_url text;

create table if not exists public.tool_shares (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  tool_id uuid not null references public.projects(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('all', 'version')),
  version_id uuid references public.tool_versions(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.tool_shares enable row level security;

create policy "tool_shares_owner_read" on public.tool_shares
  for select using (auth.uid() = created_by);

create policy "tool_shares_owner_insert" on public.tool_shares
  for insert with check (auth.uid() = created_by);
