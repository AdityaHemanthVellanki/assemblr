
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { getComposioClient } from "@/lib/integrations/composio/client";



const APPS = ["hubspot", "linear"]; // Adding Linear back to re-check
const TARGET_ACTIONS = ["HUBSPOT_CREATE_CONTACT", "LINEAR_GET_ALL_LINEAR_TEAMS"];

async function main() {
    const client = getComposioClient();
    console.log("🔍 Inspecting Schemas by App...");

    for (const app of APPS) {
        console.log(`\n\n--- App: ${app} ---`);
        try {
            // Pass app as string, not array
            const schema = await client.actions.list({ apps: app } as any);
            const actions = schema.items || [];

            // Find target actions
            for (const actionName of TARGET_ACTIONS) {
                if (actionName.toLowerCase().includes(app)) {
                    const match = actions.find((a: any) => a.name === actionName);
                    if (match) {
                        console.log(`\nAction: ${actionName}`);
                        console.log(JSON.stringify(match.parameters, null, 2));
                    } else {
                        // Maybe different name?
                        console.log(`\nAction ${actionName} NOT in list. Similar actions:`);
                        console.log(actions.filter((a: any) => a.name.includes("TEAM") || a.name.includes("SEARCH") || a.name.includes("CREATE")).map((a: any) => a.name).join(", "));
                    }
                }
            }
        } catch (e: any) {
            console.log("Error fetching schema:", e.message);
        }
    }
}

main().catch(console.error);
