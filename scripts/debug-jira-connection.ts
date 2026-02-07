
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { getComposioClient } from "@/lib/integrations/composio/client";

const ENTITY_ID = "assemblr_org_test-debug-jira-values";
const REDIRECT_URI = "https://google.com";

async function main() {
    const client = getComposioClient();
    console.log("Debugging Jira Parameter Values...");

    const values = [
        "assemblr-test",
        "assemblr-test.atlassian.net",
        "https://assemblr-test.atlassian.net"
    ];

    for (const val of values) {
        console.log(`\nTesting 'your-domain': '${val}'`);
        try {
            const payload = {
                entityId: ENTITY_ID,
                appName: "jira",
                redirectUri: REDIRECT_URI,
                authMode: "OAUTH2",
                authConfig: {},
                connectionParams: { "your-domain": val }
            };

            // @ts-ignore
            const res = await client.connectedAccounts.initiate(payload);
            console.log(`✅ SUCCESS! URL: ${res.redirectUrl}`);
            process.exit(0);
        } catch (e: any) {
            console.log(`❌ Failed: ${e.message}`);
        }
    }
}

main().catch(console.error);
