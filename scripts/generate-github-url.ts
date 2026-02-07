
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createConnection } from "@/lib/integrations/composio/connection";

const ORG_ID = "assemblr-e2e-test"; // Dedicated org for E2E
const APP = "github";

async function main() {
    console.log("Generating GitHub Connect URL for E2E...");
    try {
        const { redirectUrl } = await createConnection(ORG_ID, APP);
        console.log(`\n👉 CLICK TO CONNECT GITHUB: ${redirectUrl}\n`);
        console.log(`(Org ID: ${ORG_ID})`);
    } catch (e: any) {
        console.error(e);
    }
}

main().catch(console.error);
