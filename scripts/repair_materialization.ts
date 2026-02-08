
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

async function main() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY in env");
        // Attempt to warn but continue if client handles it? No, client needs URL/Key.
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });

    console.log("Starting repair of materialization states...");

    // query projects where status is FAILED but lifecycle_done is TRUE
    // We cast to any to avoid strict type checks for this script
    const { data: projects, error } = await (supabase
        .from("projects")
        .select("id, name, org_id, spec, status, error_message, lifecycle_done, view_ready, data_ready")
        .eq("status", "FAILED")
        .eq("lifecycle_done", true) as any);

    if (error) {
        console.error("Failed to fetch projects:", error);
        return;
    }

    console.log(`Found ${projects.length} FAILED projects with lifecycle_done=true`);

    for (const project of projects) {
        const msg = project.error_message || "";
        // If there is an actual error message, maybe it really failed.
        // But if error_message is "FINALIZE CLAIMED SUCCESS BUT..." or null, it's a candidate.
        const isFalsePositive = !msg ||
            msg.includes("view_ready MISMATCH") ||
            msg.includes("data_ready MISMATCH") ||
            msg.includes("did NOT persist") ||
            msg.includes("Tool executed but was never materialized");

        if (isFalsePositive) {
            console.log(`Reparing project ${project.id} (${project.name})...`);

            const { error: updateError } = await (supabase
                .from("projects")
                .update({
                    status: "READY",
                    error_message: null
                })
                .eq("id", project.id) as any);

            if (updateError) {
                console.error(`Failed to update project ${project.id}:`, updateError);
            } else {
                console.log(`Successfully repaired project ${project.id}`);
            }
        } else {
            console.log(`Skipping project ${project.id} (${project.name}) - appears to be genuine failure: ${project.error_message}`);
        }
    }
    console.log("Materialization repair complete.");
}

main().catch(console.error);
