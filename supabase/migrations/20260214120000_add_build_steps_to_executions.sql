-- Add build_steps column to prompt_executions for real-time build progress tracking
ALTER TABLE public.prompt_executions
ADD COLUMN IF NOT EXISTS build_steps jsonb DEFAULT '[]'::jsonb;

-- Index for efficient lookup by tool_id + status (for polling during builds)
CREATE INDEX IF NOT EXISTS idx_prompt_executions_tool_status
ON public.prompt_executions (tool_id, status)
WHERE status IN ('compiling', 'executing');
