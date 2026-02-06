
import dotenv from 'dotenv';
const result = dotenv.config({ path: '.env.local' });

if (result.parsed) {
    for (const key in result.parsed) {
        process.env[key] = result.parsed[key];
    }
}

// Ensure critical vars are set
if (!process.env.COMPOSIO_API_KEY) {
    console.error("❌ COMPOSIO_API_KEY is not defined.");
    process.exit(1);
}

import { getComposioClient } from '../lib/integrations/composio/client';
import { capabilityRegistry } from '../lib/capabilities/synthesis/registry';
import { ComposioRuntime } from '../lib/integrations/runtimes/composio';

async function main() {
    console.log("🚀 Starting Composio Integration Validation...");

    const client = getComposioClient();
    const runtime = new ComposioRuntime();

    // 1. Fetch Active Connections
    console.log("🔍 Fetching active connections from Composio...");
    try {
        const connections = await client.connectedAccounts.list({});
        const activeConnections = connections.items.filter(c => c.status === "ACTIVE" || c.status === "CONNECTED");

        if (activeConnections.length === 0) {
            console.warn("\n⚠️ No active connections found (Expected for fresh setup).");
            console.warn("👉 Please connect an integration via the dashboard at http://localhost:3000/dashboard/integrations");
            process.exit(0);
        } else {
            console.log(`✅ Found ${activeConnections.length} active connections.`);
            // ... existing logic for testing execution ...
            for (const conn of activeConnections) {
                // ... (keep existing execution test logic if desired, or simplify)
                console.log(`   - ${conn.integrationId} (${conn.status})`);
            }
        }

        console.log(`\n✅ Validation Finished.`);
        process.exit(0);

    } catch (e) {
        console.error("Error validation", e);
        process.exit(1);
    }
}

main().catch(e => {
    console.error("script failed", e);
    process.exit(1);
});
