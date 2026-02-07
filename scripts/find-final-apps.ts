
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { getComposioClient } from "@/lib/integrations/composio/client";

async function main() {
    const client = getComposioClient();
    console.log("Fetching ALL apps to find FINAL missing keys...");

    const apps = await client.apps.list();

    const searchTerms = [
        "devops", "visual", "scout", "fresh", "desk", "crm", "sales", "help"
    ];

    console.log(`Searching for: ${searchTerms.join(", ")}`);

    searchTerms.forEach(term => {
        console.log(`\n--- Matches for '${term}' ---`);
        const matches = apps.filter((a: any) =>
            a.name.toLowerCase().includes(term) ||
            a.key.toLowerCase().includes(term)
        );
        matches.forEach((m: any) => {
            console.log(`${m.name} -> ${m.key}`);
        });
    });
}

main().catch(console.error);
