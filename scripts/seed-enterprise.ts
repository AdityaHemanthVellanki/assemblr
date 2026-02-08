
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { getComposioClient } from "@/lib/integrations/composio/client";

async function main() {
    const client = getComposioClient();
    console.log("🌱 Seeding Enterprise Integrations (Zero-dependency data creation)...");

    // Helper to execute action safely
    async function execute(action: string, params: any) {
        try {
            console.log(`\n▶️  Executing ${action}...`);
            // @ts-ignore
            const res = await client.actions.execute({
                actionName: action,
                requestBody: params
            });
            console.log(`   ✅ Success!`, res);
            return res;
        } catch (e: any) {
            console.error(`   ❌ Failed: ${e.message}`);
            // Log error details if available
            if (e.response?.data) console.error("      Data:", JSON.stringify(e.response.data));
            return null;
        }
    }

    // --- GITLAB ---
    console.log("\n--- GITLAB ---");
    const glRes = await execute("GITLAB_CREATE_PROJECT", {
        name: "Assemblr Seed Project",
        path: `assemblr-seed-${Date.now()}`
    });
    if (glRes) {
        await execute("GITLAB_CREATE_PROJECT_ISSUE", {
            id: (glRes as any).id || (glRes as any).data?.id,
            title: "First Seed Issue",
            description: "Created by Assemblr seeding script."
        });
    }

    // --- BITBUCKET ---
    console.log("\n--- BITBUCKET ---");
    const bbRes = await execute("BITBUCKET_CREATE_REPOSITORY", {
        repo_slug: `assemblr-seed-${Date.now()}`,
        name: "Assemblr Seed Repo",
        description: "Created by Assemblr seeding script",
        is_private: true
    });

    // --- MICROSOFT TEAMS ---
    console.log("\n--- MICROSOFT TEAMS ---");
    await execute("MICROSOFT_TEAMS_CREATE_TEAM", {
        displayName: "Assemblr Seed Team",
        visibility: "private"
    });

    // --- OUTLOOK ---
    console.log("\n--- OUTLOOK ---");
    await execute("OUTLOOK_OUTLOOK_SEND_EMAIL", {
        subject: "Assemblr Seed Email",
        body: "This is a test email execution from Assemblr.",
        to_email: "aditya@assemblr.ai"
    });

    // --- CLICKUP ---
    console.log("\n--- CLICKUP ---");
    console.log("   (Skipping ClickUp deep seed to avoid folder dependency issues)");

    console.log("\n✅ Enterprise Seeding Complete.");
}

main();
