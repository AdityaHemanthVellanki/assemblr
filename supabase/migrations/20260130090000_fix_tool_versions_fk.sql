-- Fix tool_versions foreign key to reference projects table instead of tools table
-- This fixes the schema drift where tool_versions was pointing to a non-existent or deprecated tools table

DO $$
BEGIN
  -- 1. Drop the existing constraint if it exists (might be named tool_versions_tool_id_fkey)
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'tool_versions_tool_id_fkey') THEN
    ALTER TABLE public.tool_versions DROP CONSTRAINT tool_versions_tool_id_fkey;
  END IF;

  -- 2. Add the correct constraint referencing public.projects
  ALTER TABLE public.tool_versions 
  ADD CONSTRAINT tool_versions_tool_id_fkey 
  FOREIGN KEY (tool_id) 
  REFERENCES public.projects(id) 
  ON DELETE CASCADE;
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error fixing FK: %', SQLERRM;
END $$;
