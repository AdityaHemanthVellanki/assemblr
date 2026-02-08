
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { getComposioClient } from "@/lib/integrations/composio/client";

async function main() {
    const client = getComposioClient();
    console.log("🔍 Checking 'user-1' connections...");

    try {
        // @ts-ignore
        const ent = await client.getEntity("user-1");
        // @ts-ignore
        const conns = await ent.getConnections();

        console.log(`Found ${conns.length} connections for 'user-1'.`);
        conns.forEach((c: any) => {
            console.log(`- ${c.appName} (ID: ${c.id}, Status: ${c.status})`);
        });

    } catch (e: any) {
        console.error("Error:", e.message);
    }
}

main();
