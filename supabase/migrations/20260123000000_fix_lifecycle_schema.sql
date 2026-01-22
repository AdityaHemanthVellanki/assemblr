-- Fix tool lifecycle schema to be strict and source-of-truth

-- 1. Ensure columns exist
alter table public.projects 
  add column if not exists environment_ready boolean not null default false,
  add column if not exists activated_at timestamptz,
  add column if not exists environment jsonb;

-- Handle status column (ensure it exists)
alter table public.projects add column if not exists status text default 'CREATED';

-- 2. Data Migration & Normalization
DO $$
BEGIN
    -- Migrate is_activated if it exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'is_activated') THEN
        EXECUTE '
            update public.projects 
            set status = ''READY'', environment_ready = true, activated_at = coalesce(activated_at, now())
            where is_activated = true';
    END IF;
END $$;

-- Normalize old status values to canonical ones
update public.projects set status = 'READY' where status = 'active' or status = 'ready';
update public.projects set status = 'CREATED' where status = 'draft' or status = 'building' or status is null;
update public.projects set status = 'FAILED' where status = 'error';

-- Default unknowns to CREATED
update public.projects 
set status = 'CREATED' 
where status not in ('CREATED', 'RUNNING', 'FINALIZING', 'READY', 'FAILED');

-- 3. Apply Constraints
-- We drop the constraint if it exists to ensure it matches our new definition, or we just add it if missing.
DO $$
BEGIN
    -- Drop existing check if it exists (to ensure we update it if it was different)
    -- Actually, modifying a constraint is hard. We can drop and recreate.
    ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_status_check;
    ALTER TABLE public.projects ADD CONSTRAINT projects_status_check CHECK (status in ('CREATED', 'RUNNING', 'FINALIZING', 'READY', 'FAILED'));
END $$;

-- 4. Cleanup old columns (Strict Schema)
alter table public.projects drop column if exists is_activated;

-- 5. Index
create index if not exists projects_status_lifecycle_idx on public.projects(status);
