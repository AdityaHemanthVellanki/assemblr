
import { config } from "dotenv";
config({ path: ".env.local" });

import { getComposioClient } from "@/lib/integrations/composio/client";
import { bootstrapRealUserSession } from "./auth-bootstrap";

async function main() {
    console.log("🔍 Probing Composio Connections...");

    const { orgId, user } = await bootstrapRealUserSession();
    console.log(`User Org ID: ${orgId}`);
    console.log(`User ID: ${user.id}`);

    const client = getComposioClient();

    // Construct the entity ID as the app does
    const entityId = `assemblr_org_${orgId}`;
    console.log(`Composio Entity ID: ${entityId}`);

    try {
        console.log(`\n--- Checking Entity ID (${entityId}) ---`);
        // Note: SDK uses 'entityId' parameter for filtering by local entity ID
        const orgConnections = await client.connectedAccounts.list({
            entityId: entityId,
        });
        console.log(`Found ${orgConnections.items.length} connections for Entity ${entityId}.`);

        orgConnections.items.forEach(c => {
            console.log(`- ${c.appName} (${c.status}) [ID: ${c.id}]`);
            // Check for tokens
            if ((c as any).accessToken) {
                console.log(`  🔑 Access Token FOUND: ${(c as any).accessToken.substring(0, 5)}...`);
            }
        });

        // Also check raw orgId just in case
        if (orgConnections.items.length === 0) {
            console.log(`\n--- Checking Raw Org UUID (${orgId}) as fallback ---`);
            const rawConnections = await client.connectedAccounts.list({
                user_uuid: orgId,
            });
            console.log(`Found ${rawConnections.items.length} connections for Raw UUID.`);
            rawConnections.items.forEach(c => console.log(`- ${c.appName} (${c.status})`));
        }

    } catch (e: any) {
        console.error("Failed to list connections:", e);
    }
}

main();
