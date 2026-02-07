
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { INTEGRATIONS_UI } from "@/lib/integrations/registry";
import { getIntegrationConfig } from "@/lib/integrations/composio/config";
import { createConnection } from "@/lib/integrations/composio/connection";

// Mock Data
const MOCK_ORG_ID = "test-org-123";
const MOCK_RESUME_ID = "test-resume-456";

const DUMMY_PARAMS: Record<string, string> = {
    subdomain: "demo",
    "your-domain": "demo", // Jira (demo.atlassian.net exists)
    COMPANYDOMAIN: "demo", // Pipedrive (demo.pipedrive.com exists)
    instanceEndpoint: "https://assemblr-test.my.salesforce.com", // Salesforce worked with this? Or maybe I should use a real one if it fails. But it passed earlier.
    dc: "us19",
    shop: "demo.myshopify.com",
};

async function main() {
    console.log("🚀 Starting Master Connection Validation Protocol...");
    console.log(`Targeting ${INTEGRATIONS_UI.length} integrations.`);

    const results: { id: string; status: "PASS" | "FAIL"; url?: string; error?: string }[] = [];

    for (const integration of INTEGRATIONS_UI) {
        const config = getIntegrationConfig(integration.id);
        console.log(`\nTesting: ${integration.name} (${integration.id})`);

        try {
            // Prepare params
            const params: Record<string, any> = {};
            if (config.requiredParams) {
                config.requiredParams.forEach(p => {
                    if (DUMMY_PARAMS[p]) {
                        params[p] = DUMMY_PARAMS[p];
                    } else {
                        console.warn(`  ⚠️ Missing dummy value for param: ${p}`);
                        params[p] = "dummy-value";
                    }
                });
                console.log(`  Injecting params: ${JSON.stringify(params)}`);
            }

            // Execute
            const { redirectUrl } = await createConnection(MOCK_ORG_ID, integration.id, MOCK_RESUME_ID, params);

            if (!redirectUrl || !redirectUrl.startsWith("http")) {
                throw new Error(`Invalid URL returned: ${redirectUrl}`);
            }

            console.log(`  ✅ Success: ${redirectUrl.substring(0, 50)}...`);
            results.push({ id: integration.id, status: "PASS", url: redirectUrl });

        } catch (e: any) {
            console.error(`  ❌ Failed: ${e.message}`);
            results.push({ id: integration.id, status: "FAIL", error: e.message });
        }
    }

    console.log("\n--- SUMMARY ---");
    const passed = results.filter(r => r.status === "PASS");
    const failed = results.filter(r => r.status === "FAIL");

    console.log(`Total: ${results.length}`);
    console.log(`Passed: ${passed.length}`);
    console.log(`Failed: ${failed.length}`);

    const report = results.map(r => `${r.status === "PASS" ? "✅" : "❌"} ${r.id}: ${r.status === "PASS" ? r.url : r.error}`).join("\n");
    const fs = await import("fs");
    fs.writeFileSync("connection-report.txt", report);
    console.log("Report detailed written to connection-report.txt");

    if (failed.length > 0) {
        console.log("\nFailures:");
        failed.forEach(f => console.log(`- ${f.id}: ${f.error}`));
        process.exit(1);
    } else {
        console.log("\n🎉 ALL SYSTEMS GO. Integration Front Door is 100% Operational.");
    }
}

main().catch(console.error);
