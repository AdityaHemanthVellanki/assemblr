/**
 * Quick test to check what unique constraint exists on integration_schemas
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY!;

async function main() {
    console.log("🔍 Testing integration_schemas write...\n");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    const testOrgId = "00000000-0000-0000-0000-000000000000";

    // Try inserting with resource_type
    console.log("Testing INSERT with resource_type column...");
    const payload = {
        org_id: testOrgId,
        integration_id: "_test_",
        resource_type: "_test_resource_",
        schema: { test: true },
        last_discovered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    console.log("Payload:", JSON.stringify(payload, null, 2));

    const { data, error } = await supabase
        .from("integration_schemas")
        .insert(payload)
        .select();

    if (error) {
        console.error("❌ INSERT failed:", {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint,
        });

        // Try with just required columns
        console.log("\n\nTrying with minimal required columns...");
        const minPayload = {
            org_id: testOrgId,
            integration_id: "_test_min_",
            resource_type: "_test_resource_",
            schema: { test: true },
        };

        const { data: minData, error: minError } = await supabase
            .from("integration_schemas")
            .insert(minPayload)
            .select();

        if (minError) {
            console.error("❌ Minimal INSERT also failed:", minError);
        } else {
            console.log("✅ Minimal INSERT succeeded:", minData);

            // Clean up
            await supabase.from("integration_schemas").delete().eq("org_id", testOrgId);
            console.log("Cleaned up test data");
        }
    } else {
        console.log("✅ INSERT succeeded:", data);

        // Clean up
        await supabase.from("integration_schemas").delete().eq("org_id", testOrgId);
        console.log("Cleaned up test data");
    }
}

main().catch(console.error);
