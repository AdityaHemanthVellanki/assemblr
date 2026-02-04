/**
 * Inspect indexes on integration_schemas
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY!;

async function main() {
    console.log("🔍 Inspecting indexes...\n");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    // Query pg_indexes via rpc if possible, or just try to blindly hit constraints.
    // Since we can't easily run arbitrary SQL select on system tables via client (usually),
    // we can use the `rpc` called `exec_sql` if we created it previously, or just try onConflicts.

    // Let's try upsert with different onConflicts to see which one works.

    const testPayload = {
        org_id: "00000000-0000-0000-0000-000000000000",
        integration_id: "_constraint_test_",
        resource: "_test_",
        resource_type: "_test_",
        schema: { test: true },
        last_discovered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    console.log("1. Trying onConflict: 'org_id,integration_id,resource'");
    const { error: error1 } = await supabase
        .from("integration_schemas")
        .upsert(testPayload, { onConflict: "org_id,integration_id,resource" });

    if (!error1) {
        console.log("   ✅ MATCH! The constraint is on (org_id, integration_id, resource)");
    } else {
        console.log("   ❌ Failed:", error1.message);
    }

    console.log("\n2. Trying onConflict: 'org_id,integration_id,resource_type'");
    const { error: error2 } = await supabase
        .from("integration_schemas")
        .upsert(testPayload, { onConflict: "org_id,integration_id,resource_type" });

    if (!error2) {
        console.log("   ✅ MATCH! The constraint is on (org_id, integration_id, resource_type)");
    } else {
        console.log("   ❌ Failed:", error2.message);
    }

    // Cleanup
    await supabase.from("integration_schemas").delete().eq("integration_id", "_constraint_test_");
}

main().catch(console.error);
