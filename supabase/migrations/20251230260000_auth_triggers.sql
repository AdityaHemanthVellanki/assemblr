-- Improved Auth Trigger for Org Provisioning
create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_org_id uuid;
  user_name text;
begin
  -- 1. Determine User Name
  user_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(new.email, '@', 1)
  );

  -- 2. Create Organization (Idempotent check not needed as this runs on INSERT of user)
  insert into public.organizations (name)
  values (coalesce(user_name, 'My Workspace') || '''s Workspace')
  returning id into new_org_id;

  -- 3. Create Membership (Owner)
  insert into public.memberships (user_id, org_id, role)
  values (new.id, new_org_id, 'owner');

  -- 4. Update User Profile (if you have one, or metadata)
  -- Here we rely on memberships table as truth, so no metadata update needed.

  return new;
end;
$$;

-- Recreate trigger to ensure it uses the new function
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_auth_user_created();

-- Backfill: Ensure all existing users have an organization
-- This is a safety measure for dev environments
do $$
declare
  user_rec record;
  org_count int;
  new_org_id uuid;
begin
  for user_rec in select * from auth.users loop
    select count(*) into org_count from public.memberships where user_id = user_rec.id;
    
    if org_count = 0 then
      insert into public.organizations (name)
      values ('Restored Workspace')
      returning id into new_org_id;

      insert into public.memberships (user_id, org_id, role)
      values (user_rec.id, new_org_id, 'owner');
    end if;
  end loop;
end;
$$;
