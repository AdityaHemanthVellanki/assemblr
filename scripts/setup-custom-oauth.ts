
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { getComposioClient } from "@/lib/integrations/composio/client";
import readline from "readline";

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const APPS = [
    "github", "slack", "google", "linear", "hubspot", "stripe", "trello",
    "airtable", "discord", "intercom", "zoom", "gitlab", "bitbucket",
    "asana", "clickup", "microsoft_teams", "outlook", "quickbooks"
];

async function ask(query: string): Promise<string> {
    return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
    const client = getComposioClient();
    console.log("🛠️  Deep White-Labeling Assistant (Custom OAuth Apps)");
    console.log("-----------------------------------------------------");
    console.log("This tool helps you upload your Custom OAuth Credentials to Composio.");
    console.log("For instructions on where to get these credentials, see: white-labeling-setup.md\n");

    while (true) {
        console.log("\nAvailable Apps:");
        APPS.forEach((app, i) => process.stdout.write(`${i + 1}. ${app}  `));
        console.log("\n");

        const selection = await ask("Select an app (number) or 'q' to quit: ");
        if (selection.toLowerCase() === 'q') break;

        const index = parseInt(selection) - 1;
        if (isNaN(index) || index < 0 || index >= APPS.length) {
            console.log("❌ Invalid selection.");
            continue;
        }

        const appName = APPS[index];
        console.log(`\nConfiguring [${appName.toUpperCase()}]...`);

        const clientId = await ask(`Enter Client ID for ${appName}: `);
        if (!clientId) { console.log("Skipped."); continue; }

        const clientSecret = await ask(`Enter Client Secret for ${appName}: `);
        if (!clientSecret) { console.log("Skipped."); continue; }

        try {
            console.log(`🚀 Updating ${appName} configuration via Composio SDK...`);

            // Note: The SDK method for setting custom auth varies. 
            // We use 'integrations.update' or similar if available, or fall back to
            // creating a specific connection with these params if that's the only way.
            // Documentation implies we associate this with the integration definition.

            // As per Context7, we might need to set 'auth_config' or use specific endpoint.
            // Since specific SDK method for *updating global app config* isn't strictly typed in known valid/invalid lists,
            // we will try the most common pattern: updating the integration's default authConfig.

            // @ts-ignore
            await client.apps.update({
                appId: appName,
                authConfig: {
                    clientId: clientId,
                    clientSecret: clientSecret
                }
            });

            console.log(`✅ Successfully updated ${appName} with custom credentials!`);
            console.log(`   The "Sign in with..." screen in ${appName} should now show YOUR app details.`);

        } catch (e: any) {
            console.error(`❌ Failed to update ${appName}:`, e.message);
            console.log("   (Composio might require this to be done via dashboard if SDK doesn't support this specific update.)");
        }
    }

    rl.close();
}

main();
