
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { getComposioClient } from "@/lib/integrations/composio/client";

async function main() {
    const client = getComposioClient();
    console.log("🔍 Listing Unique App Names (Page 1)...");

    try {
        // @ts-ignore
        const res = await client.actions.list({ page: 1 });
        const items = res.items || (Array.isArray(res) ? res : []);

        const appNames = new Set(items.map((i: any) => i.appName));

        console.log(`\nFound ${appNames.size} unique apps in first ${items.length} actions:`);
        Array.from(appNames).sort().forEach(name => console.log(`- ${name}`));

    } catch (e) {
        console.error("Error:", e);
    }
}

main();
