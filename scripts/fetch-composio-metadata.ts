
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { getComposioClient } from "@/lib/integrations/composio/client";

const MISSING_APPS = [
    "gitlab", "bitbucket", "azure-devops",
    "asana", "clickup", "monday",
    "microsoft-teams", "outlook",
    "zoho-crm", "freshsales",
    "freshdesk", "helpscout",
    "google-analytics", "amplitude", "quickbooks",
    "mailchimp", "facebook-ads"
];

async function main() {
    const client = getComposioClient();
    console.log("Fetching metadata for missing apps...");

    const apps = await client.apps.list();

    for (const target of MISSING_APPS) {
        // Fuzzy match
        const found = apps.find((a: any) =>
            a.name.toLowerCase().includes(target.replace(/-/g, " ")) ||
            a.key.toLowerCase().includes(target)
        );

        if (found) {
            console.log(`\n### FOUND: ${target} -> ${found.key} (${found.name})`);
            console.log(`Logo: ${found.logo}`);

            // Get params
            try {
                // @ts-ignore
                const params = await client.apps.getRequiredParams(found.key);
                console.log("Params:", JSON.stringify(params?.authSchemes?.OAUTH2?.required_fields || [], null, 2));
            } catch (e) {
                console.log("Could not fetch params.");
            }
        } else {
            console.log(`\n!!! NOT FOUND: ${target}`);
        }
    }
}

main().catch(console.error);
