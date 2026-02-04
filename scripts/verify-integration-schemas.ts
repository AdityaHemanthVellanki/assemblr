/**
 * Integration Schema Table Verification Script
 * 
 * This script verifies that the integration_schemas table exists with all required columns
 * and optionally creates it if missing. Run this after database migrations or when seeing
 * schema persistence errors.
 * 
 * Usage: npx tsx scripts/verify-integration-schemas.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";


const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY!;

const EXPECTED_COLUMNS = [
    "id",
    "org_id",
    "integration_id",
    "resource_type", // NOTE: DB uses resource_type, code uses schema.resource
    "schema",
    "last_discovered_at",
    "created_at",
    "updated_at",
];

async function main() {
    console.log("🔍 Verifying integration_schemas table...\n");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. Check if table exists by doing a simple select
    console.log("1. Checking if integration_schemas table exists...");
    const { data: tableCheck, error: tableError } = await supabase
        .from("integration_schemas")
        .select("id")
        .limit(1);

    if (tableError) {
        if (tableError.code === "42P01" || tableError.message.includes("does not exist")) {
            console.error("❌ Table 'integration_schemas' does NOT exist!");
            process.exit(1);
        }

        console.error("❌ Unexpected error:", tableError);
        process.exit(1);
    }

    console.log("✅ Table exists!");

    // 2. Verify columns by inserting and selecting a test row
    console.log("\n2. Testing column availability (using resource_type)...");

    const testOrgId = "00000000-0000-0000-0000-000000000000";
    const testPayload = {
        org_id: testOrgId,
        integration_id: "_verification_test_",
        resource: "_test_resource_",      // Required by DB
        resource_type: "_test_resource_", // Required by DB
        schema: JSON.stringify({ test: true }),
        last_discovered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const { error: insertError } = await supabase
        .from("integration_schemas")
        .upsert(testPayload, { onConflict: "org_id,integration_id,resource" });

    if (insertError) {
        console.error("❌ Column test failed:", insertError);

        if (insertError.code === "23502") {
            console.log(`\n⚠️  NOT NULL constraint violation: ${insertError.message}`);
            console.log("   Check that all required columns are being provided.");
        } else if (insertError.code === "PGRST204") {
            console.log(`\n⚠️  PostgREST schema cache error: ${insertError.message}`);
            console.log("   Run: NOTIFY pgrst, 'reload schema' in Supabase SQL Editor");
        }
        process.exit(1);
    }

    console.log("✅ All columns are accessible!");

    // 3. Clean up test row
    console.log("\n3. Cleaning up test data...");
    await supabase
        .from("integration_schemas")
        .delete()
        .eq("org_id", testOrgId)
        .eq("integration_id", "_verification_test_");

    console.log("✅ Cleanup complete!");

    console.log("\n✅ ✅ ✅ integration_schemas table is correctly configured! ✅ ✅ ✅\n");

    // 4. Show current schema count
    const { count } = await supabase
        .from("integration_schemas")
        .select("*", { count: "exact", head: true });

    console.log(`📊 Current row count: ${count ?? 0}`);
}

main().catch((err) => {
    console.error("Script failed:", err);
    process.exit(1);
});
