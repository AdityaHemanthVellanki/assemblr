-- TRUNCATE all tool-related tables to ensure a total reset
TRUNCATE public.tool_runs CASCADE;
TRUNCATE public.tool_outputs CASCADE;
TRUNCATE public.tool_versions CASCADE;
TRUNCATE public.projects CASCADE;
TRUNCATE public.synthesized_capabilities CASCADE;
