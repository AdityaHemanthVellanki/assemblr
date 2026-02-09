
import { config } from "dotenv";
config({ path: ".env.local" });

import { getComposioClient } from "@/lib/integrations/composio/client";
import { bootstrapRealUserSession } from "./auth-bootstrap";

async function main() {
    console.log("🌱 Starting Data Seeding via Composio...");

    const { orgId } = await bootstrapRealUserSession();
    const entityId = `assemblr_org_${orgId}`;
    const client = getComposioClient();

    // 1. Check connections
    const connections = await client.connectedAccounts.list({ entityId });
    const activeApps = connections.items.filter(c => c.status === "ACTIVE").map(c => c.appName);

    console.log("Active Integrations:", activeApps);

    if (activeApps.length === 0) {
        console.error("❌ No active connections found. Please connect integrations in the dashboard first.");
        return;
    }

    // --- GitHub Seeding ---
    if (activeApps.includes("github")) {
        console.log("\n--- Seeding GitHub ---");
        try {
            // Fetch repos to find a target
            const repos = await client.executeAction({
                entityId,
                appName: "github",
                actionName: "github_repos_list",
                input: { per_page: 5 }
            });

            const targetRepo = (repos.data as any)?.[0]?.full_name || "AdityaHemanthVellanki/assemblr"; // Fallback
            console.log(`Using Repo: ${targetRepo}`);

            await client.executeAction({
                entityId,
                appName: "github",
                actionName: "github_issues_create",
                input: {
                    owner: targetRepo.split("/")[0],
                    repo: targetRepo.split("/")[1],
                    title: "🚀 Hardening Test: Scalability Audit",
                    body: "Automatically generated for integration verification."
                }
            });
            console.log("✅ Created GitHub Issue.");
        } catch (e: any) {
            console.error("❌ GitHub Seeding failed:", e.message);
        }
    }

    // --- Linear Seeding ---
    if (activeApps.includes("linear")) {
        console.log("\n--- Seeding Linear ---");
        try {
            const teams = await client.executeAction({
                entityId,
                appName: "linear",
                actionName: "linear_teams_list",
                input: {}
            });
            const teamId = (teams.data as any)?.teams?.[0]?.id;

            if (teamId) {
                await client.executeAction({
                    entityId,
                    appName: "linear",
                    actionName: "linear_issues_create",
                    input: {
                        teamId,
                        title: "🛠️ Integration Polish: Composio Handlers",
                        description: "Verifying multi-tool execution consistency."
                    }
                });
                console.log("✅ Created Linear Issue.");
            } else {
                console.warn("⚠️ No Linear teams found.");
            }
        } catch (e: any) {
            console.error("❌ Linear Seeding failed:", e.message);
        }
    }

    // --- Slack Seeding ---
    if (activeApps.includes("slack")) {
        console.log("\n--- Seeding Slack ---");
        try {
            const channels = await client.executeAction({
                entityId,
                appName: "slack",
                actionName: "slack_channels_list",
                input: { types: "public_channel" }
            });
            const channelId = (channels.data as any)?.channels?.[0]?.id;

            if (channelId) {
                await client.executeAction({
                    entityId,
                    appName: "slack",
                    actionName: "slack_chat_postMessage",
                    input: {
                        channel: channelId,
                        text: "🔔 *Integration Success*: Restricted bot scopes verified. Assemblr is now communicating via bot tokens!"
                    }
                });
                console.log("✅ Posted Slack Message.");
            } else {
                console.warn("⚠️ No Slack channels found.");
            }
        } catch (e: any) {
            console.error("❌ Slack Seeding failed:", e.message);
        }
    }

    console.log("\n✨ Seeding process complete.");
}

main();
