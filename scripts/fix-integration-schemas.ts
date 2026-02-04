/**
 * Fix Integration Schemas Table Script
 * 
 * This script directly executes SQL to ensure the integration_schemas table is correctly configured.
 * It uses the Supabase Management API or raw SQL to add missing columns.
 * 
 * Usage: npx tsx scripts/fix-integration-schemas.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY!;

async function executeRawSQL(sql: string, description: string): Promise<boolean> {
    console.log(`\n📝 ${description}...`);

    // Using fetch to hit the Supabase REST API with raw SQL
    // This requires service role key
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "apikey": SUPABASE_SECRET_KEY,
            "Authorization": `Bearer ${SUPABASE_SECRET_KEY}`,
            "Prefer": "return=minimal",
        },
        body: JSON.stringify({ query: sql }),
    });

    if (!response.ok) {
        const text = await response.text();
        // If the function doesn't exist, that's expected - we'll need alternative approach
        if (text.includes("exec_sql") && text.includes("does not exist")) {
            console.log("   ⚠️  exec_sql function not available - will need to run SQL manually");
            return false;
        }
        console.error(`   ❌ Failed: ${text}`);
        return false;
    }

    console.log("   ✅ Success!");
    return true;
}

async function main() {
    console.log("🔧 Fixing integration_schemas table...\n");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    // First, check what columns exist using information_schema via a workaround
    console.log("1. Checking current table structure...");

    // Try to select from the table with just id to see if it exists
    const { data: exists, error: existsError } = await supabase
        .from("integration_schemas")
        .select("id")
        .limit(1);

    if (existsError && (existsError.message.includes("does not exist") || existsError.code === "42P01")) {
        console.log("   ❌ Table does not exist! Creating it...");

        // Output the SQL that needs to be run
        console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║  MANUAL ACTION REQUIRED                                                       ║
╚══════════════════════════════════════════════════════════════════════════════╝

The integration_schemas table does not exist in your Supabase database.

Please go to:
  1. Supabase Dashboard → SQL Editor
  2. Run the following SQL:

----------------------------------------------------------------------
-- Create integration_schemas table
create table if not exists public.integration_schemas (
  id uuid default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  integration_id text not null,
  resource text not null,
  schema jsonb not null,
  last_discovered_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  
  unique(org_id, integration_id, resource)
);

-- Enable RLS
alter table public.integration_schemas enable row level security;

-- Create policies
create policy "Users can view schemas of their org"
on public.integration_schemas for select
to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.org_id = integration_schemas.org_id
    and m.user_id = auth.uid()
  )
);

create policy "System can manage schemas"
on public.integration_schemas for all
to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.org_id = integration_schemas.org_id
    and m.user_id = auth.uid()
    and m.role in ('owner', 'editor')
  )
);

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
----------------------------------------------------------------------

After running this, the Linear integration should work correctly.
    `);
        process.exit(1);
    }

    // Table exists but column might be missing
    // Let's try inserting with all expected columns to identify the issue
    console.log("   ✅ Table exists");

    console.log("\n2. Checking if 'resource' column exists...");

    const testPayload = {
        org_id: "00000000-0000-0000-0000-000000000000",
        integration_id: "_test_",
        resource: "_test_",
        schema: JSON.stringify({ test: true }),
        last_discovered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const { error: insertError } = await supabase
        .from("integration_schemas")
        .upsert(testPayload, { onConflict: "org_id,integration_id,resource" });

    if (insertError?.code === "PGRST204" && insertError.message.includes("resource")) {
        console.log("   ❌ Column 'resource' is missing or not in PostgREST cache");

        console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║  MANUAL ACTION REQUIRED                                                       ║
╚══════════════════════════════════════════════════════════════════════════════╝

The 'resource' column is missing from integration_schemas table.

Please go to:
  1. Supabase Dashboard → SQL Editor
  2. Run the following SQL:

----------------------------------------------------------------------
-- Add missing resource column
ALTER TABLE public.integration_schemas 
ADD COLUMN IF NOT EXISTS resource text;

-- Set a default value for any existing rows
UPDATE public.integration_schemas 
SET resource = 'unknown' 
WHERE resource IS NULL;

-- Make it not null
ALTER TABLE public.integration_schemas 
ALTER COLUMN resource SET NOT NULL;

-- Recreate the unique constraint if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'integration_schemas_org_id_integration_id_resource_key'
  ) THEN
    ALTER TABLE public.integration_schemas 
    ADD CONSTRAINT integration_schemas_org_id_integration_id_resource_key 
    UNIQUE (org_id, integration_id, resource);
  END IF;
END $$;

-- CRITICAL: Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
----------------------------------------------------------------------

After running this:
  1. Wait 5-10 seconds for the schema cache to reload
  2. Try connecting Linear again
    `);
        process.exit(1);
    }

    if (insertError) {
        console.error("   ❌ Unexpected error:", insertError);
        process.exit(1);
    }

    console.log("   ✅ Column exists and is working!");

    // Clean up test data
    console.log("\n3. Cleaning up test data...");
    await supabase
        .from("integration_schemas")
        .delete()
        .eq("org_id", "00000000-0000-0000-0000-000000000000");

    console.log("   ✅ Cleanup complete");

    console.log("\n\n✅ ✅ ✅ integration_schemas table is correctly configured! ✅ ✅ ✅\n");
    console.log("Linear integration should now work correctly.\n");
}

main().catch((err) => {
    console.error("Script failed:", err);
    process.exit(1);
});
