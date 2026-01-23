ALTER TABLE public.tool_render_state
ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
