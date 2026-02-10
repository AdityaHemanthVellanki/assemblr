-- Migration to relax unique constraint on integration_connections
-- to support multiple accounts per integration per organization.

ALTER TABLE public.integration_connections 
DROP CONSTRAINT IF EXISTS integration_connections_org_id_integration_id_key;

-- Add user_id if not present (to track who connected the account)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'integration_connections'
          AND column_name = 'user_id'
    ) THEN
        ALTER TABLE public.integration_connections ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
END
$$;

-- Add label for distinguishability
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'integration_connections'
          AND column_name = 'label'
    ) THEN
        ALTER TABLE public.integration_connections ADD COLUMN label TEXT;
    END IF;
END
$$;

-- Ensure we have a unique constraint on the actual Composio connection ID to avoid duplicates
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'integration_connections'
          AND column_name = 'composio_connection_id'
    ) THEN
        ALTER TABLE public.integration_connections ADD COLUMN composio_connection_id TEXT;
        -- We won't add UNIQUE yet to avoid breaking if people have rows without it, 
        -- but ideally it should be unique.
    END IF;
END
$$;
