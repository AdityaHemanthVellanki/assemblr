
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createConnection } from "@/lib/integrations/composio/connection";

const ORG_ID = "assemblr-e2e-test";

async function main() {
    console.log("Generating E2E Connect URLs...");

    try {
        const github = await createConnection(ORG_ID, "github");
        console.log(`\n👉 GitHub: ${github.redirectUrl}`);

        const slack = await createConnection(ORG_ID, "slackbot");
        console.log(`\n👉 Slack (slackbot): ${slack.redirectUrl}`);

        console.log(`\n(Org ID: ${ORG_ID})`);
    } catch (e: any) {
        console.error(e);
    }
}

main().catch(console.error);
