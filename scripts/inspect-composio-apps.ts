
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { getComposioClient } from "@/lib/integrations/composio/client";

async function main() {
    const client = getComposioClient();

    console.log("Searching for Jira app...");
    try {
        const apps = await client.apps.list();
        const jiraApps = apps.filter((a: any) =>
            a.name.toLowerCase().includes("jira") ||
            a.key.toLowerCase().includes("jira") ||
            a.name.toLowerCase().includes("atlassian")
        );

        console.log("Found Jira-related apps:");
        jiraApps.forEach((app: any) => {
            console.log(`- Name: ${app.name}, Key: ${app.key}, AppId: ${app.appId}`);
        });

        if (jiraApps.length > 0) {
            const targetApp = jiraApps[0]; // Assuming first is primary
            console.log(`\nInspecting required params for '${targetApp.key}'...`);
            // @ts-ignore
            const params = await client.apps.getRequiredParams(targetApp.key);
            console.log(JSON.stringify(params, null, 2));
        } else {
            console.log("No Jira app found!");
        }

    } catch (error: any) {
        console.error("Error inspecting apps:", error.message);
        if (error.response) {
            console.error("Response:", JSON.stringify(error.response.data, null, 2));
        }
    }
}

main().catch(console.error);
