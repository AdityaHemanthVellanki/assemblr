
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createConnection } from "@/lib/integrations/composio/connection";
import { INTEGRATION_AUTH_CONFIG } from "@/lib/integrations/composio/config";
import { getComposioClient } from "@/lib/integrations/composio/client";

const ORG_ID = "assemblr_org_ab56931e-6dfb-4036-a643-f190a62a7d92";
const USER_ID = "assemblr-e2e-test";

// List filtered for Zero-Friction (Zero-Config) Compliance
const TARGET_APPS = [
    "google", "stripe", "airtable", "intercom",
    "zoom", "gitlab", "bitbucket", "asana", "clickup",
    "microsoft_teams", "outlook", "google_analytics", "quickbooks"
];

async function main() {
    const client = getComposioClient();
    console.log("🔍 Checking existing connections to avoid duplicates...");
    const accounts = await client.connectedAccounts.list({ userUuid: USER_ID } as any);
    const existingApps = new Set(accounts.items.map((a: any) => a.appUniqueId));

    console.log("🔄 Generating Authorization Links for New Integrations...\n");

    for (const app of TARGET_APPS) {
        // Skip if already exists (optional, but requested 'all involved')
        // if (existingApps.has(app)) { console.log(`⏩ ${app} already connected.`); continue; }

        try {
            // Some apps might need specific params, defaulting to empty or config-based
            const { redirectUrl } = await createConnection(ORG_ID, app);
            console.log(`🔗 [${app.toUpperCase()}]\n${redirectUrl}\n`);
        } catch (e: any) {
            console.log(`❌ Failed to generate URL for ${app}:`, e.message);
        }
    }
}

main().catch(console.error);
