-- Expand projects.status to enforce strict 6-state lifecycle
-- States: CREATED → PLANNED → READY_TO_EXECUTE → EXECUTING → MATERIALIZED → FAILED

-- 1. Drop existing status CHECK constraints (multiple migrations added them)
DO $$
BEGIN
  -- Drop by constraint name patterns
  ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_status_check;
  ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_status_check1;
EXCEPTION WHEN undefined_object THEN
  -- Constraint doesn't exist, that's fine
  NULL;
END $$;

-- 2. Map old statuses to new lifecycle states
UPDATE public.projects SET status = 'CREATED' WHERE status = 'DRAFT' OR status IS NULL;
UPDATE public.projects SET status = 'MATERIALIZED' WHERE status = 'READY';
UPDATE public.projects SET status = 'MATERIALIZED' WHERE status = 'ACTIVE';
UPDATE public.projects SET status = 'MATERIALIZED' WHERE status = 'COMPILING';

-- 3. Add new CHECK constraint with all 6 states
ALTER TABLE public.projects ADD CONSTRAINT projects_status_check
  CHECK (status IN ('CREATED', 'PLANNED', 'READY_TO_EXECUTE', 'EXECUTING', 'MATERIALIZED', 'FAILED'));

-- 4. Set default for new rows
ALTER TABLE public.projects ALTER COLUMN status SET DEFAULT 'CREATED';

-- 5. Ensure NOT NULL
ALTER TABLE public.projects ALTER COLUMN status SET NOT NULL;
