
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

async function main() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error("❌ Missing SUPABASE_URL or SUPABASE_SECRET_KEY");
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("🔥 Starting Use Case System Hard Reset...");

    const tables = [
        'tool_results',
        'tool_versions',
        'tool_lifecycle_state',
        'tool_build_logs',
        'prompt_executions',
        'synthesized_capabilities',
        'projects'
    ];

    for (const table of tables) {
        console.log(`🗑️  Truncating ${table}...`);
        const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (error) {
            console.error(`   ❌ Failed to truncate ${table}:`, error.message);
        } else {
            console.log(`   ✅ ${table} cleared.`);
        }
    }

    console.log("\n✨ Database Cleanup Complete.");
}

main();
