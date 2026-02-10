
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { getComposioClient } from "../lib/integrations/composio/client";
import { Octokit } from "octokit";
import { LinearClient } from "@linear/sdk";

async function main() {
    console.log("🌱 Starting Robust Enterprise Seeding...");

    // 1. GitHub Seeding (Octokit)
    if (process.env.GITHUB_CLIENT_SECRET) {
        console.log("\n--- GITHUB (SDK) ---");
        try {
            // Note: This assumes a personal access token or pre-negotiated auth for the seeding account
            // In a real environment, we'd use the integration's token if available.
            // For now, we use the Composio execute as a fallback for standard actions.
        } catch (e) {
            console.error("   ❌ GitHub SDK Fallback");
        }
    }

    const client = getComposioClient();

    async function execute(action: string, params: any) {
        try {
            console.log(`▶️  Executing ${action}...`);
            // @ts-ignore
            const res = await client.actions.execute({
                actionName: action,
                requestBody: params
            });
            console.log(`   ✅ Success!`);
            return res;
        } catch (e: any) {
            console.error(`   ❌ Failed: ${e.message}`);
            return null;
        }
    }

    // --- DISCOVERY ---
    console.log("\n🔍 Discovering entity IDs...");

    let linearTeamId = "";
    try {
        const linearRes = await client.actions.execute({ actionName: "LINEAR_LIST_TEAMS", requestBody: {} });
        linearTeamId = (linearRes as any).data?.[0]?.id || (linearRes as any).items?.[0]?.id;
    } catch (e) { }

    let slackChannelId = "";
    try {
        const slackRes = await client.actions.execute({ actionName: "SLACK_LIST_CHANNELS", requestBody: {} });
        slackChannelId = (slackRes as any).data?.[0]?.id || (slackRes as any).items?.[0]?.id;
    } catch (e) { }

    // --- EXECUTION ---

    // GITHUB
    await execute("GITHUB_ISSUES_CREATE", {
        owner: "AdityaHemanthVellanki",
        repo: "assemblr",
        title: "CRITICAL: Database connection pool exhaustion under high load",
        body: "Enterprise-grade issue for testing velocity metrics."
    });

    // LINEAR
    if (linearTeamId) {
        await execute("LINEAR_CREATE_ISSUE", {
            title: "Phase 2: Migration to multi-region architecture",
            team_id: linearTeamId,
            description: "High priority task for infra team."
        });
    }

    // SLACK
    if (slackChannelId) {
        await execute("SLACK_CHAT_POST_MESSAGE", {
            channel: slackChannelId,
            text: "🚨 *New Incident Detected*: System latency increased by 40% in us-east-1. \nInvestigating correlation with recent deployment #442."
        });
    }

    // HUBSPOT
    await execute("HUBSPOT_DEAL_CREATE", {
        dealname: "Enterprise Expansion: Global Logistics Corp",
        amount: "125000",
        dealstage: "contractsent"
    });

    // INTERCOM
    await execute("INTERCOM_CONVERSATIONS_CREATE", {
        body: "We need an update on the custom integration feature. Our legal team is pressing.",
        from: { type: "user", id: "user_123" }
    });

    // STRIPE
    await execute("STRIPE_CHARGES_CREATE", {
        amount: 500000,
        currency: "usd",
        description: "Annual Subscription: Acme Enterprise"
    });

    console.log("\n✅ Robust Seeding Complete.");
}

main();
