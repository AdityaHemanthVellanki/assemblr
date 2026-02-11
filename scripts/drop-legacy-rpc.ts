
import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load .env.local manually since setup-env.cjs might use process.env differently or not be fully compatible with pg usage
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function run() {
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

    if (!connectionString) {
        console.error("❌ No DATABASE_URL or POSTGRES_URL found in .env.local or environment.");
        process.exit(1);
    }

    console.log(`Connecting to database... using ${connectionString.startsWith("postgres://") ? "postgres://..." : "other protocol"}`);

    const client = new Client({
        connectionString: connectionString,
        ssl: { rejectUnauthorized: false } // Supabase requires SSL usually
    });

    try {
        await client.connect();
        console.log("✅ Connected to database.");

        // Check if function exists first (optional but nice)
        // Actually DROP IF EXISTS is safer.

        const query = `DROP FUNCTION IF EXISTS public.finalize_tool_render_state(uuid, uuid, jsonb, jsonb, jsonb, boolean, boolean, timestamptz);`;
        // Note: DROP FUNCTION needs signature if overloaded.
        // Let's try simpler DROP FUNCTION with just name if no overload.
        // But checking migrations, it has many arguments.
        // The safest is DROP FUNCTION IF EXISTS public.finalize_tool_render_state;
        // But Postgres requires argument types if overloaded.

        // We can query pg_proc to find signature.
        const procRes = await client.query("SELECT oid::regprocedure FROM pg_proc WHERE proname = 'finalize_tool_render_state'");
        if (procRes.rows.length === 0) {
            console.log("⚠️ Function finalize_tool_render_state not found. Already dropped?");
        } else {
            console.log(`Found ${procRes.rows.length} version(s) of finalize_tool_render_state.`);
            for (const row of procRes.rows) {
                const signature = row.oid; // e.g. "finalize_tool_render_state(uuid, ...)"
                console.log(`Dropping ${signature}...`);
                await client.query(`DROP FUNCTION ${signature}`);
                console.log(`✅ Dropped ${signature}`);
            }
        }

    } catch (err) {
        console.error("❌ Error executing script:", err);
        process.exit(1);
    } finally {
        await client.end();
    }
}

run();
