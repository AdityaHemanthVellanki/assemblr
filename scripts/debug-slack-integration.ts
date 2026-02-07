
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { getComposioClient } from "@/lib/integrations/composio/client";

async function main() {
    const client = getComposioClient();
    console.log("🔍 Debugging Slack Integration...");

    try {
        // 1. List Apps matching "slack"
        // @ts-ignore
        const apps = await client.apps.list(); // No query? Or maybe query string?
        console.log("Got response:", typeof apps, Object.keys(apps));

        // @ts-ignore
        const allApps = apps.items || apps; // Handle both structures

        console.log("\nFound Slack-related Apps:");
        allApps.forEach((app: any) => {
            if (app.name && app.name.toLowerCase().includes("slack")) {
                console.log(`- Name: ${app.name}, Key: ${app.key}, ID: ${app.id}, isLocal: ${app.isLocal}`);
            }
            if (app.key && app.key.toLowerCase().includes("slack")) {
                // ...
            }
        });

        // 2. Get Required Params for 'slack'
        try {
            // @ts-ignore
            const params = await client.apps.getRequiredParams({ appName: "slack" });
            console.log("\nRequired Params for 'slack':", JSON.stringify(params, null, 2));
        } catch (e: any) {
            console.log("\nFailed to get params for 'slack':", e.message);
        }

        // 3. Try generating URL with minimal scopes
        // We'll use the 'createConnection' helper from library to ensure same logic
        // But let's verify if we should use 'slack_bot' or similar if found in step 1.

    } catch (e: any) {
        console.error("Debug failed:", e);
    }
}

main().catch(console.error);
