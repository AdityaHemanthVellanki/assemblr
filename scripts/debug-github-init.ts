
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createConnection } from "@/lib/integrations/composio/connection";

async function main() {
    const orgId = "test-org-github-" + Date.now();
    const integrationId = "github"; // Should map to "github" app

    console.log("Testing createConnection for GITHUB...");
    console.log(`Org: ${orgId}, Integration: ${integrationId}`);

    try {
        const result = await createConnection(orgId, integrationId);
        console.log("SUCCESS!");
        console.log("Redirect URL:", result.redirectUrl);
        console.log("Connection ID:", result.connectionId);
    } catch (error: any) {
        console.error("FAILURE:", error);
        if (error.response) {
            console.error("Response Data:", JSON.stringify(error.response.data, null, 2));
        }
        process.exit(1);
    }
}

main().catch(console.error);
