
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { getComposioClient } from "@/lib/integrations/composio/client";

const USER_ID = "assemblr-e2e-test";
const COMPANY_NAME = "Assemblr Inc";
const CONTACT_EMAIL = "test@assemblr.ai";

async function main() {
    const client = getComposioClient();
    console.log(`🌱 Seeding CRM Tools for: ${USER_ID}`);

    const accounts = await client.connectedAccounts.list({ userUuid: USER_ID } as any);

    // --- SALESFORCE ---
    // DISABLED: Requires custom domain/instance URL. Not zero-friction. 
    console.log("⚪ Salesforce is disabled (Enterprise only). Skipping.");

    // --- HUBSPOT ---
    const hsConn = accounts.items.find((a: any) =>
        (a.appUniqueId === "hubspot" || a.appName === "hubspot") && a.status === "ACTIVE"
    );

    if (hsConn) {
        console.log(`\n🟧 HubSpot Found (${hsConn.id}). Seeding...`);
        try {
            // Create Contact
            console.log(`Creating Contact: ${CONTACT_EMAIL}...`);
            try {
                await client.actions.execute({
                    actionName: "HUBSPOT_CREATE_CONTACT", // Schema suggests this or close variant
                    requestBody: {
                        connectedAccountId: hsConn.id,
                        input: {
                            email: CONTACT_EMAIL,
                            firstname: "Test",
                            lastname: "User",
                            company: COMPANY_NAME
                        }
                    } as any
                });
                console.log("✅ HubSpot Contact Created.");
            } catch (createErr: any) {
                // HubSpot 409 Conflict if email exists often happens
                console.warn("HubSpot create failed (exists?):", createErr.message);
            }

        } catch (e: any) {
            console.error("❌ HubSpot Seeding Failed:", e.message);
        }
    } else {
        console.log("\n⚪ HubSpot NOT Active. Skipping.");
    }
}

main().catch(console.error);
