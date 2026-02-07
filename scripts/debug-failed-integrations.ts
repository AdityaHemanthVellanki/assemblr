
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { getComposioClient } from "@/lib/integrations/composio/client";

const APPS = [
    "jira", "salesforce", "pipedrive", "shopify", "freshdesk"
];

async function main() {
    const client = getComposioClient();
    console.log("Debugging params...");

    for (const app of APPS) {
        try {
            // @ts-ignore
            const params = await client.apps.getRequiredParams(app);
            console.log(`\n### ${app} ###`);
            console.log("OAUTH2 Params:", JSON.stringify(params?.authSchemes?.OAUTH2?.required_fields || [], null, 2));
        } catch (e: any) {
            console.log(`\n### ${app} FAILED: ${e.message}`);
        }
    }
}

main().catch(console.error);
