
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { getComposioClient } from "@/lib/integrations/composio/client";

const ENTITY_ID = "test-pipe-" + Date.now();
const REDIRECT_URI = "https://google.com";

async function main() {
    const client = getComposioClient();
    console.log("Debugging Pipedrive...");

    const payload = {
        entityId: ENTITY_ID,
        appName: "pipedrive",
        redirectUri: REDIRECT_URI,
        authMode: "OAUTH2",
        authConfig: {},
        connectionParams: { "COMPANYDOMAIN": "assemblr-test" }
    };

    try {
        // @ts-ignore
        const res = await client.connectedAccounts.initiate(payload);
        console.log(`✅ SUCCESS! URL: ${res.redirectUrl}`);
    } catch (e: any) {
        console.log(`❌ Failed: ${e.message}`);
    }
}

main().catch(console.error);
