
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { getComposioClient } from "@/lib/integrations/composio/client";

const ENTITY_ID = "test-jira-debug-" + Date.now();
const REDIRECT_URI = "https://google.com";

async function main() {
    const client = getComposioClient();
    console.log("Debugging Jira Param Keys...");

    const keys = [
        "your-domain",
        "subdomain",
        "domain",
        "site",
        "url",
        "jira_domain",
        "base_url"
    ];

    for (const key of keys) {
        console.log(`\nTesting key: '${key}'`);
        const params: any = {};
        params[key] = "assemblr-test";

        const payload = {
            entityId: ENTITY_ID,
            appName: "jira",
            redirectUri: REDIRECT_URI,
            authMode: "OAUTH2",
            authConfig: {},
            connectionParams: params
        };

        try {
            // @ts-ignore
            const res = await client.connectedAccounts.initiate(payload);
            console.log(`✅ SUCCESS with key '${key}'! URL: ${res.redirectUrl}`);
            process.exit(0);
        } catch (e: any) {
            console.log(`❌ Failed: ${e.message}`);
        }
    }
}

main().catch(console.error);
