
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { getComposioClient } from "@/lib/integrations/composio/client";

const USER_ID = "assemblr-e2e-test";

async function main() {
    const client = getComposioClient();
    console.log(`🔍 Testing GitHub Read Access for: ${USER_ID}`);

    // 1. Resolve Connection IDs
    const accounts = await client.connectedAccounts.list({ userUuid: USER_ID } as any);

    // Find first ACTIVE GitHub
    const githubConn = accounts.items.find((a: any) => (a.appUniqueId === "github" || a.appName === "github") && a.status === "ACTIVE");
    if (!githubConn) throw new Error("No ACTIVE GitHub connection found");
    const githubId = githubConn.id;
    console.log(`Targeting ACTIVE GitHub Connection: ${githubId}`);

    try {
        // 2. GITHUB: List Issues
        // Use a very simple action that needs no complex params
        console.log("Fetching Schema for Action...");
        // actions param is a string (comma separated?), or just singular? The error said expected string.
        const schema = await client.actions.list({ actions: "GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER" } as any);
        console.log("Schema Parameters:", JSON.stringify(schema.items[0].parameters, null, 2));

        console.log("Listing Repositories...");
        const repos = await client.actions.execute({
            actionName: "GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER",
            requestBody: {
                connectedAccountId: githubId,
                input: { type: "public" } // Wrapped in input per ZExecuteParams schema
            } as any
        });

        console.log("✅ GitHub Read Success!");
        console.log("Repos found:", JSON.stringify(repos, null, 2).substring(0, 200) + "...");

    } catch (e: any) {
        console.error("❌ GitHub Read Failed:", e);
        if (e.data) console.error("Data:", JSON.stringify(e.data));
    }
}

main().catch(console.error);
