-- Fix tool_versions schema drift
ALTER TABLE tool_versions 
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS compiled_tool jsonb,
ADD COLUMN IF NOT EXISTS intent_schema jsonb,
ADD COLUMN IF NOT EXISTS diff jsonb,
ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Reload schema cache hint (handled by application restart usually, but good to document)
NOTIFY pgrst, 'reload schema';
