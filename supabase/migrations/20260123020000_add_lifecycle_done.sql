
-- Add lifecycle_done flag to projects table
-- This is the authoritative signal that no further work will be performed for this tool.
-- It is INDEPENDENT of status (READY/FAILED).

ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS lifecycle_done BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for performance
CREATE INDEX IF NOT EXISTS projects_lifecycle_done_idx ON public.projects(lifecycle_done);
