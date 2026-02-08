
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { getComposioClient } from "@/lib/integrations/composio/client";

async function main() {
    const client = getComposioClient();
    // Try singular app names first. If that fails, we might need 'appNames' key.
    const TARGETS = ["gitlab", "bitbucket", "microsoft_teams", "outlook", "clickup"];

    console.log("🔍 Targeted Search (Iterative)...");

    for (const app of TARGETS) {
        console.log(`\nFetching actions for: ${app}...`);
        try {
            // @ts-ignore
            // Try 'apps' as string first
            let res = await client.actions.list({ apps: app });
            let items = res.items || (Array.isArray(res) ? res : []);

            if (items.length === 0) {
                // Fallback: Try 'appName' singular if available, or just log query failure
                console.log(`  (0 items found with apps='${app}')`);
            } else {
                console.log(`  Found ${items.length} actions.`);
                // Filter for CREATE/ADD/NEW/SEND
                const createActions = items.filter((a: any) =>
                    a.name.includes("CREATE") || a.name.includes("ADD") || a.name.includes("NEW") ||
                    a.name.includes("SEND") || a.name.includes("POST")
                );

                if (createActions.length > 0) {
                    createActions.sort().forEach((a: any) => console.log(`  - ${a.name}`));
                } else {
                    console.log("  (No CREATE actions found, showing first 5):");
                    items.slice(0, 5).forEach((a: any) => console.log(`  - ${a.name}`));
                }
            }
        } catch (e: any) {
            console.error(`  Error fetching ${app}:`, e.message);
        }
    }
}

main();
