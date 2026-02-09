
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { removeConnection } from "@/lib/integrations/composio/connection";

const ORGANIZATION_ID = "0a71e770-05f1-46de-8696-8b3e786129ca"; // Verified via probe script

async function main() {
    console.log("Removing stale connections for org:", ORGANIZATION_ID);
    try {
        console.log("- Removing Slack...");
        await removeConnection(ORGANIZATION_ID, "slack");
        console.log("- Removing GitHub...");
        await removeConnection(ORGANIZATION_ID, "github");
        console.log("✅ Successfully cleared stale connections.");
    } catch (error) {
        console.error("❌ Failed to clear connections:", error);
    }
}

main();
