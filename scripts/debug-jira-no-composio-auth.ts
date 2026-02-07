
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { getComposioClient } from "@/lib/integrations/composio/client";

const ENTITY_ID = "assemblr_org_test-debug-jira-no-auth";
const REDIRECT_URI = "https://google.com";

async function main() {
    const client = getComposioClient();
    console.log("Debugging Jira Connection Payload (No usage of explicit authMode)...");

    const payload = {
        entityId: ENTITY_ID,
        appName: "jira",
        redirectUri: REDIRECT_URI,
        // No authMode
        // No authConfig
        connectionParams: { "your-domain": "assemblr-test" }
    };

    try {
        // @ts-ignore
        const res = await client.connectedAccounts.initiate(payload);
        console.log(`✅ SUCCESS! URL: ${res.redirectUrl}`);
    } catch (e: any) {
        console.log(`❌ Failed: ${e.message}`);
        if (e.data) console.log("Data:", JSON.stringify(e.data));
    }
}

main().catch(console.error);
