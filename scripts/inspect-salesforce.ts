
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { getComposioClient } from "@/lib/integrations/composio/client";

async function main() {
    const client = getComposioClient();

    console.log("Searching for Salesforce app...");
    try {
        const apps = await client.apps.list();
        const sfApps = apps.filter((a: any) =>
            a.name.toLowerCase().includes("salesforce") ||
            a.key.toLowerCase().includes("salesforce")
        );

        console.log("Found Salesforce apps:");
        sfApps.forEach((app: any) => {
            console.log(`- Name: ${app.name}, Key: ${app.key}, AppId: ${app.appId}`);
        });

        if (sfApps.length > 0) {
            const targetApp = sfApps[0];
            console.log(`\nInspecting required params for '${targetApp.key}'...`);
            // @ts-ignore
            const params = await client.apps.getRequiredParams(targetApp.key);
            console.log(JSON.stringify(params, null, 2));
        } else {
            console.log("No Salesforce app found!");
        }

    } catch (error: any) {
        console.error("Error inspecting apps:", error.message);
    }
}

main().catch(console.error);
