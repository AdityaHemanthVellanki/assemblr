-- Ensure tool_spec exists before referencing it (Fixes 42703)
ALTER TABLE tool_versions ADD COLUMN IF NOT EXISTS tool_spec jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE tool_versions ADD COLUMN IF NOT EXISTS compiled_tool jsonb;
UPDATE tool_versions SET compiled_tool = '{}'::jsonb WHERE compiled_tool IS NULL;
ALTER TABLE tool_versions ALTER COLUMN compiled_tool SET NOT NULL;

ALTER TABLE tool_versions ADD COLUMN IF NOT EXISTS build_hash text;
UPDATE tool_versions SET build_hash = md5(tool_spec::text || id::text) WHERE build_hash IS NULL;
ALTER TABLE tool_versions ALTER COLUMN build_hash SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tool_versions_tool_id_build_hash_key ON tool_versions(tool_id, build_hash);

CREATE TABLE IF NOT EXISTS tool_memory (
  tool_id uuid NOT NULL,
  org_id uuid,
  user_id uuid,
  namespace text NOT NULL,
  key text NOT NULL,
  value jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tool_id, namespace, key, org_id, user_id)
);

CREATE TABLE IF NOT EXISTS session_memory (
  session_id text NOT NULL,
  namespace text NOT NULL,
  key text NOT NULL,
  value jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, namespace, key)
);

CREATE TABLE IF NOT EXISTS user_memory (
  user_id uuid NOT NULL,
  namespace text NOT NULL,
  key text NOT NULL,
  value jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, namespace, key)
);

CREATE TABLE IF NOT EXISTS org_memory (
  org_id uuid NOT NULL,
  namespace text NOT NULL,
  key text NOT NULL,
  value jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, namespace, key)
);

CREATE TABLE IF NOT EXISTS tool_lifecycle_state (
  tool_id uuid PRIMARY KEY,
  state text NOT NULL,
  details jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tool_build_logs (
  tool_id uuid NOT NULL,
  build_id text NOT NULL,
  logs jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tool_id, build_id)
);
