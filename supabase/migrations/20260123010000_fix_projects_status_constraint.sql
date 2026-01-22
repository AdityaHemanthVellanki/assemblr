-- Drop existing constraint if it exists (name might vary, so we try standard names or rely on the fact that we are replacing it)
-- We can't easily know the constraint name without querying, but we can try to drop the check constraint on the column.

DO $$
BEGIN
    -- Drop the constraint if it exists. 
    -- Note: The constraint name is usually projects_status_check or similar.
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_status_check') THEN
        ALTER TABLE public.projects DROP CONSTRAINT projects_status_check;
    END IF;
END $$;

-- Add the new constraint matching PROJECT_STATUSES
ALTER TABLE public.projects 
  ADD CONSTRAINT projects_status_check 
  CHECK (status IN ('CREATED', 'RUNNING', 'READY', 'FAILED'));

-- Update any existing rows that might have old values (optional, but good for safety)
UPDATE public.projects 
SET status = 'CREATED' 
WHERE status NOT IN ('CREATED', 'RUNNING', 'READY', 'FAILED');
