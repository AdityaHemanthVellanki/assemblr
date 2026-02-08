
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { getComposioClient } from "@/lib/integrations/composio/client";

async function main() {
    const client = getComposioClient();
    console.log("🔍 Scanning ALL Entities for ACTIVE/CONNECTED status...");

    try {
        // Scan active connections directly? passing active=true?
        // client.connections.list({ active: true })? No such param usually.
        // We iterate entities.

        let found = false;
        // Check first 100 entities
        // @ts-ignore
        const res = await client.entities.list({ page: 1, limit: 100 }); // Assuming limit param
        const items = res.items || (Array.isArray(res) ? res : []);

        console.log(`Found ${items.length} entities to scan.`);

        for (const entItem of items) {
            const id = entItem.id;
            // Optimization: only check if we suspect it's real
            if (id.includes("test") || id === "default") {
                // proceed
            }

            try {
                // @ts-ignore
                const ent = await client.getEntity(id);
                // @ts-ignore
                const conns = await ent.getConnections();

                // Filter for ACTIVE or CONNECTED
                const active = conns.filter((c: any) => c.status === "ACTIVE" || c.status === "CONNECTED");

                if (active.length > 0) {
                    console.log(`\n🎉 FOUND PASSIVE/ACTIVE CONNECTIONS for Entity: '${id}'`);
                    active.forEach((c: any) => {
                        console.log(`   - ${c.appName} (ID: ${c.id}, Status: ${c.status})`);
                    });
                    found = true;
                }
            } catch (e) {
                // ignore
            }
        }

        if (!found) {
            console.log("\n❌ NO ACTIVE CONNECTIONS FOUND ON ANY ENTITY.");
        }

    } catch (e: any) {
        console.error("Error listing entities:", e.message);
    }
}

main();
