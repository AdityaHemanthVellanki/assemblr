
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { getComposioClient } from "@/lib/integrations/composio/client";

async function main() {
    const client = getComposioClient();

    const ACTIONS = [
        "GITLAB_CREATE_PROJECT",
        "BITBUCKET_CREATE_REPOSITORY",
        "MICROSOFT_TEAMS_CREATE_TEAM",
        "OUTLOOK_OUTLOOK_SEND_EMAIL",
        "CLICKUP_CREATE_LIST"
    ];

    console.log("🔍 Inspecting Schemas...");

    for (const actionName of ACTIONS) {
        console.log(`\n--- Action: ${actionName} ---`);
        try {
            // @ts-ignore
            // There isn't a direct 'get' for action schema in the simple client sometimes.
            // We usually get it from 'list' but filter.
            // But let's try 'client.actions.get' if available, or hack it via list.

            // Hack: List actions for the app and find it.
            const appName = actionName.split("_")[0].toLowerCase(); // heuristic
            // bitbucket, gitlab, microsoft, outlook, clickup

            // Adjust appName for microsoft_teams and outlook
            let targetApp = appName;
            if (actionName.startsWith("MICROSOFT_TEAMS")) targetApp = "microsoft_teams";
            if (actionName.startsWith("OUTLOOK")) targetApp = "outlook";
            if (actionName.startsWith("CLICKUP")) targetApp = "clickup";

            // @ts-ignore
            const res = await client.actions.list({ apps: targetApp });
            const items = res.items || (Array.isArray(res) ? res : []);

            const action = items.find((a: any) => a.name === actionName);

            if (action) {
                console.log("Description:", action.description);
                console.log("Parameters:", JSON.stringify(action.parameters, null, 2));
            } else {
                console.log("❌ Action not found in list.");
            }

        } catch (e: any) {
            console.error(`Error:`, e.message);
        }
    }
}

main();
