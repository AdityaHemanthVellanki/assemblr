
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createConnection } from "@/lib/integrations/composio/connection";

async function main() {
    const orgId = "test-org-sf-" + Date.now();

    // Note: resumeId is optional
    const resumeId = "test-resume-id";

    // Required params for Salesforce
    const params = {
        "subdomain": "test-assemblr-dev-ed",
        "instanceEndpoint": "https://test-assemblr-dev-ed.develop.my.salesforce.com"
    };

    console.log("Testing createConnection (abstraction) for SALESFORCE with params...");
    console.log(`Org: ${orgId}`);

    try {
        const result = await createConnection(orgId, "salesforce", resumeId, { connectionParams: params });

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
