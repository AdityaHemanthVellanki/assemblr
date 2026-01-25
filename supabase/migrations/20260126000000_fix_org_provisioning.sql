-- Fix for missing organization provisioning on user signup
-- This migration updates the handle_new_user trigger to ensure every new user
-- gets a default organization and membership, fixing the "No organization membership" error.
-- It explicitly handles both public.users (legacy/backend) and public.profiles (frontend)
-- to ensure foreign key constraints in public.memberships are satisfied.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  user_name text;
  user_avatar text;
begin
  -- 1. Extract Metadata
  user_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(new.email, '@', 1)
  );
  user_avatar := new.raw_user_meta_data->>'avatar_url';

  -- 2. Create User Record (Required for memberships FK)
  -- public.users is the referenced table for memberships
  insert into public.users (id, email, name)
  values (new.id, new.email, user_name)
  on conflict (id) do update
  set
    name = excluded.name,
    email = excluded.email;

  -- 3. Create Profile (Frontend/UI)
  insert into public.profiles (id, name, email, avatar_url)
  values (new.id, user_name, new.email, user_avatar)
  on conflict (id) do update
  set
    name = excluded.name,
    email = excluded.email,
    avatar_url = coalesce(excluded.avatar_url, profiles.avatar_url);

  -- 4. Create Default Organization
  -- We create a personal workspace for the user
  insert into public.orgs (name)
  values (coalesce(user_name, 'My') || '''s Workspace')
  returning id into new_org_id;

  -- 5. Create Membership (Owner)
  insert into public.memberships (user_id, org_id, role)
  values (new.id, new_org_id, 'owner');

  -- 6. Update User's Current Org (Legacy/Convenience)
  update public.users 
  set current_org_id = new_org_id 
  where id = new.id;

  return new;
end;
$$;

-- Recreate trigger to ensure it uses the updated function
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Backfill: Ensure all existing users have an organization and valid user/profile records
-- This fixes any users currently stuck in the "No organization membership" state
do $$
declare
  user_rec record;
  org_count int;
  new_org_id uuid;
  user_name text;
begin
  for user_rec in select * from auth.users loop
    -- 1. Determine User Name
    user_name := coalesce(
      user_rec.raw_user_meta_data->>'full_name',
      user_rec.raw_user_meta_data->>'name',
      split_part(user_rec.email, '@', 1)
    );

    -- 2. Ensure public.users Exists (Critical for memberships FK)
    insert into public.users (id, email, name)
    values (
      user_rec.id,
      user_rec.email,
      user_name
    )
    on conflict (id) do nothing;

    -- 3. Ensure public.profiles Exists (Critical for UI)
    insert into public.profiles (id, name, email, avatar_url)
    values (
      user_rec.id, 
      user_name, 
      user_rec.email, 
      user_rec.raw_user_meta_data->>'avatar_url'
    )
    on conflict (id) do nothing;

    -- 4. Check for Organization Membership
    select count(*) into org_count 
    from public.memberships 
    where user_id = user_rec.id;
    
    -- 5. Create Org & Membership if missing
    if org_count = 0 then
      insert into public.orgs (name)
      values (coalesce(user_name, 'My') || '''s Workspace')
      returning id into new_org_id;

      insert into public.memberships (user_id, org_id, role)
      values (user_rec.id, new_org_id, 'owner');
      
      -- Update current_org_id
      update public.users 
      set current_org_id = new_org_id 
      where id = user_rec.id;
      
      raise notice 'Fixed missing org for user: %', user_rec.email;
    end if;
  end loop;
end;
$$;
