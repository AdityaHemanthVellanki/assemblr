
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { getComposioClient } from "@/lib/integrations/composio/client";

async function main() {
    const client = getComposioClient();
    const accounts = await client.connectedAccounts.list({ user_uuid: "assemblr-e2e-test" });

    console.log("Checking connections for user: assemblr-e2e-test");
    const connectedApps = accounts.items.map((a: any) => a.appUniqueId);
    console.log("Connected Apps:", connectedApps);

    const hasGithub = connectedApps.includes("github");
    const hasSlack = connectedApps.includes("slack");

    if (hasGithub && hasSlack) {
        console.log("✅ GitHub and Slack are connected!");
        process.exit(0);
    } else {
        console.log("❌ Missing connections.");
        if (!hasGithub) console.log("- GitHub missing");
        if (!hasSlack) console.log("- Slack missing");
        process.exit(1);
    }
}

main().catch(console.error);
