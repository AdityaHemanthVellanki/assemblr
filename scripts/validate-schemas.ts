
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { getComposioClient } from "@/lib/integrations/composio/client";

const APPS_TO_TEST = ["github", "salesforce", "slack", "linear", "notion"];

async function main() {
    const client = getComposioClient();
    console.log("🚀 Starting Schema & Capability Discovery...");
    console.log(`Targeting Apps: ${APPS_TO_TEST.join(", ")}`);

    const results: { app: string; status: "PASS" | "FAIL"; actionCount: number; error?: string }[] = [];

    for (const app of APPS_TO_TEST) {
        console.log(`\nTesting: ${app}`);
        try {
            // @ts-ignore
            const actions = await client.actions.list({ apps: app });
            console.log(`  Found ${actions.items.length} actions.`);

            if (actions.items.length === 0) {
                throw new Error("No actions found for app.");
            }

            // Sample an action
            const sample = actions.items[0];
            console.log(`  Sample Action: ${sample.name}`);
            console.log(`  Description: ${sample.description}`);
            console.log(`  Parameters: ${JSON.stringify(sample.parameters, null, 2).substring(0, 200)}...`);

            results.push({ app, status: "PASS", actionCount: actions.items.length });
            // @ts-ignore
        } catch (e: any) {
            console.error(`  ❌ Failed: ${e.message}`);
            results.push({ app, status: "FAIL", actionCount: 0, error: e.message });
        }
    }

    console.log("\n--- SUMMARY ---");
    results.forEach(r => {
        console.log(`${r.status === "PASS" ? "✅" : "❌"} ${r.app}: ${r.actionCount} actions found.${r.error ? " Error: " + r.error : ""}`);
    });

    const passed = results.filter(r => r.status === "PASS");
    if (passed.length === APPS_TO_TEST.length) {
        console.log("\n🎉 ALL SYSTEMS GO. Integration Back Door (Capabilities) is Open.");
    } else {
        console.log("\n⚠️ Some integrations failed schema discovery.");
        process.exit(1);
    }
}

main().catch(console.error);
