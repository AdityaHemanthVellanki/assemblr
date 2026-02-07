
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { getComposioClient } from "@/lib/integrations/composio/client";

async function main() {
    const orgId = "test-org-jira-" + Date.now();
    const client = getComposioClient();
    const entityId = `assemblr_org_${orgId}`;

    // Try clean redirect URI
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/composio`;
    const subdomain = "assemblr-test";

    console.log("Testing direct SDK initiate for JIRA with CLEAN redirect URI and subdomain...");

    const payload = {
        entityId,
        appName: "jira",
        redirectUri,
        // authMode: "OAUTH2", // Try omitting authMode first? Or keep it?
        // KEEP IT because inspector said it's required scheme
        authMode: "OAUTH2",
        authConfig: {
            "your-domain": subdomain
        },
        connectionParams: {
            "your-domain": subdomain
        }
    };

    // HACK: Pass empty authConfig to force useComposioAuth: true if needed,
    // But here we are passing 'your-domain' in it.
    // wait, if we pass 'your-domain' in authConfig, sdk sets useComposioAuth = true.

    try {
        // @ts-ignore
        const connectionRequest = await client.connectedAccounts.initiate(payload);

        console.log("SUCCESS!");
        console.log("Redirect URL:", connectionRequest.redirectUrl);
        console.log("Connection ID:", connectionRequest.connectedAccountId);
    } catch (error: any) {
        console.error("FAILURE:", error);
        if (error.response) {
            console.error("Response Data:", JSON.stringify(error.response.data, null, 2));
        }
        process.exit(1);
    }
}

main().catch(console.error);
