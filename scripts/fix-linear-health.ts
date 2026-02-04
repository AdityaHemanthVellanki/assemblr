/**
 * Fix Linear Integration Health Status
 * 
 * This script clears the stale "error" status in integration_health table for Linear,
 * which was caused by the missing test implementation.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY!;

async function main() {
    console.log("🚑 Fixing Linear integration health status...\n");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. Find all orgs with Linear integration
    const { data: integrations, error: fetchError } = await supabase
        .from("integration_connections")
        .select("org_id, integration_id")
        .eq("integration_id", "linear")
        .eq("status", "active");

    if (fetchError) {
        console.error("❌ Failed to fetch integrations:", fetchError);
        process.exit(1);
    }

    console.log(`Found ${integrations.length} active Linear integrations.`);

    for (const connection of integrations) {
        console.log(`Processing Org: ${connection.org_id}`);

        // 2. Reset integration_health
        const { error: updateError } = await supabase
            .from("integration_health")
            .upsert({
                org_id: connection.org_id,
                integration_id: "linear",
                status: "ok",
                error_message: null,
                error_code: null,
                last_checked_at: new Date().toISOString()
            }, { onConflict: "org_id, integration_id" });

        if (updateError) {
            console.error(`   ❌ Failed to reset health: ${updateError.message}`);
        } else {
            console.log(`   ✅ Reset health status to 'ok'`);
        }
    }

    console.log("\n✅ Done!");
}

main().catch(console.error);
