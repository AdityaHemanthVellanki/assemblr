
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createConnection } from "@/lib/integrations/composio/connection";

const ORG_ID = "assemblr_org_ab56931e-6dfb-4036-a643-f190a62a7d92";
const APPS = ["linear", "jira", "salesforce", "hubspot", "notion", "trello", "discord"];

async function main() {
    console.log("🔄 Generating Reconnect Links for Remaining Tasks...");

    for (const app of APPS) {
        try {
            const { redirectUrl } = await createConnection(ORG_ID, app);
            console.log(`\n🔗 [${app.toUpperCase()}] Click to Authorize:\n${redirectUrl}`);
        } catch (e: any) {
            console.log(`❌ Failed to generate URL for ${app}:`, e.message);
        }
    }
}

main().catch(console.error);
