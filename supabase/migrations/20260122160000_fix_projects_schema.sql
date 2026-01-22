-- Fix projects table schema drift
-- Adding owner_id and status columns which are missing in the actual DB but expected by code

alter table public.projects add column if not exists owner_id uuid references auth.users(id);
alter table public.projects add column if not exists status text default 'draft';

-- Update existing projects to have a status if null
update public.projects set status = 'draft' where status is null;

-- Make status not null (optional, but good practice)
alter table public.projects alter column status set not null;

-- Grant permissions if needed (though admin client bypasses RLS)
-- grant all on public.projects to service_role;
