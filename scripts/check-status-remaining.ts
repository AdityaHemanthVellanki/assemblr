
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { getComposioClient } from "@/lib/integrations/composio/client";

const USER_ID = "assemblr-e2e-test";
const TARGET_APPS = ["linear", "jira", "salesforce", "hubspot", "notion", "trello", "discord"];

async function main() {
    const client = getComposioClient();
    console.log(`🔍 Checking Connection Status for: ${TARGET_APPS.join(", ")}`);

    const accounts = await client.connectedAccounts.list({ userUuid: USER_ID } as any);

    const statusMap: Record<string, string> = {};
    const missing: string[] = [];

    for (const app of TARGET_APPS) {
        // Find ANY connection for this app
        const conn = accounts.items.find((a: any) =>
            (a.appUniqueId?.toLowerCase() === app || a.appName?.toLowerCase() === app)
        );

        if (conn) {
            statusMap[app] = conn.status;
            console.log(`- ${app}: ${conn.status} (ID: ${conn.id})`);
        } else {
            statusMap[app] = "MISSING";
            missing.push(app);
            console.log(`- ${app}: ❌ MISSING`);
        }
    }

    // Summary
    console.log("\n--- Status Summary ---");
    console.table(statusMap);
}

main().catch(console.error);
