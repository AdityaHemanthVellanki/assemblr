
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { getComposioClient } from "@/lib/integrations/composio/client";

async function main() {
    const client = getComposioClient();
    console.log("🔍 Debugging Action Fetching...\n");

    try {
        // Test 1: Pagination
        console.log("Test 1: Check Pagination (Page 1 vs Page 2)");
        // @ts-ignore
        const p1 = await client.actions.list({ page: 1 });
        const i1 = p1.items || (Array.isArray(p1) ? p1 : []);
        console.log(`Page 1 first item: ${i1[0]?.name}`);

        // @ts-ignore
        const p2 = await client.actions.list({ page: 2 });
        const i2 = p2.items || (Array.isArray(p2) ? p2 : []);
        console.log(`Page 2 first item: ${i2[0]?.name}`);

        if (i1[0]?.name === i2[0]?.name) {
            console.warn("⚠️  WARNING: Page 1 and Page 2 are identical! Pagination might be ignored.");
        } else {
            console.log("✅ Pagination seems to work (items differ).");
        }

        // Test 2: Filter by 'apps'
        console.log("\nTest 2: Filter by 'apps: [gitlab]'");
        // @ts-ignore
        const f1 = await client.actions.list({ apps: ["gitlab"] });
        const r1 = f1.items || (Array.isArray(f1) ? f1 : []);
        console.log(`Found ${r1.length} actions for 'apps: [gitlab]'`);
        if (r1.length > 0) console.log(`Sample: ${r1[0].name}`);

        // Test 3: Filter by 'appNames'
        console.log("\nTest 3: Filter by 'appNames: [gitlab]'");
        // @ts-ignore
        const f2 = await client.actions.list({ appNames: ["gitlab"] });
        const r2 = f2.items || (Array.isArray(f2) ? f2 : []);
        console.log(`Found ${r2.length} actions for 'appNames: [gitlab]'`);
        if (r2.length > 0) console.log(`Sample: ${r2[0].name}`);

    } catch (e) {
        console.error("Error:", e);
    }
}

main();
