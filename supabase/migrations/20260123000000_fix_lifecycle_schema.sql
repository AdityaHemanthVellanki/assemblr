-- Fix tool lifecycle schema to be strict and source-of-truth
-- Canonical Enum: DRAFT, BUILDING, READY, FAILED

-- 1. Ensure columns exist
alter table public.projects 
  add column if not exists error_message text,
  add column if not exists finalized_at timestamptz,
  add column if not exists environment jsonb;

-- Drop constraint BEFORE updates to allow transitions during migration
alter table public.projects drop constraint if exists projects_status_check;

-- Handle status column (ensure it exists)
alter table public.projects add column if not exists status text default 'DRAFT';

-- 2. Data Migration & Normalization
DO $$
BEGIN
    -- Migrate is_activated if it exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'is_activated') THEN
        EXECUTE '
            update public.projects 
            set status = ''READY''
            where is_activated = true';
    END IF;
END $$;

-- Normalize old status values to canonical ones
-- READY mappings
update public.projects set status = 'READY' where status in ('active', 'ACTIVE', 'ready', 'MATERIALIZED', 'FINALIZING', 'READY');

-- BUILDING mappings
update public.projects set status = 'BUILDING' where status in ('building', 'COMPILING', 'RUNNING');

-- FAILED mappings
update public.projects set status = 'FAILED' where status in ('error', 'FAILED');

-- DRAFT mappings (everything else or explicit)
update public.projects set status = 'DRAFT' where status in ('draft', 'DRAFT', 'CREATED') or status is null;

-- Default unknowns to DRAFT
update public.projects 
set status = 'DRAFT' 
where status not in ('DRAFT', 'BUILDING', 'READY', 'FAILED');

-- 3. Apply Constraints
alter table public.projects add constraint projects_status_check 
  check (status in ('DRAFT', 'BUILDING', 'READY', 'FAILED'));

-- 4. Cleanup old columns (Strict Schema - Zero Phantom Columns)
alter table public.projects drop column if exists is_activated;
alter table public.projects drop column if exists environment_ready;
alter table public.projects drop column if exists activated_at;

-- 5. Index
create index if not exists projects_status_lifecycle_idx on public.projects(status);
