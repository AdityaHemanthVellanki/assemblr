
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { getComposioClient } from "@/lib/integrations/composio/client";

const USER_ID = "assemblr-e2e-test";
const REPO_NAME = "assemblr-seed-v1"; // Unique-ish
const SLACK_CHANNEL = "assemblr-seed-v1"; // Slack channels must be lowercase, no spaces

async function main() {
    const client = getComposioClient();
    console.log(`🌱 Seeding Data for User: ${USER_ID}`);

    // 1. Resolve Connection IDs
    // Note: check-connections.ts used userUuid and worked, despite lint warnings.
    const accounts = await client.connectedAccounts.list({ userUuid: USER_ID } as any);
    console.log("Found accounts:", JSON.stringify(accounts.items.slice(0, 3), null, 2)); // Log first 3 to inspect structure

    // Find first ACTIVE GitHub
    const githubConn = accounts.items.find((a: any) => (a.appUniqueId === "github" || a.appName === "github") && a.status === "ACTIVE");
    if (!githubConn) {
        console.log("Available GitHub connections:", accounts.items.filter((a: any) => a.appUniqueId === "github").map((a: any) => `${a.id} (${a.status})`));
        throw new Error("No ACTIVE GitHub connection found");
    }
    const githubId = githubConn.id;
    console.log(`Targeting ACTIVE GitHub Connection: ${githubId}`);

    // Find first ACTIVE Slack
    // We accept 'slack' or 'slackbot'
    const slackConn = accounts.items.find((a: any) =>
        (a.appUniqueId === "slack" || a.appName === "slack" || a.appUniqueId === "slackbot" || a.appName === "slackbot")
        && a.status === "ACTIVE"
    );
    if (!slackConn) {
        console.log("Available Slack connections:", accounts.items.filter((a: any) => a.appUniqueId?.includes("slack")).map((a: any) => `${a.id} (${a.status})`));
        // We might proceed if only GitHub is active to partial seed?
        // For now, let's throw to be explicit.
        throw new Error("No ACTIVE Slack connection found");
    }
    const slackId = slackConn.id;
    console.log(`Targeting ACTIVE Slack Connection: ${slackId}`);

    try {
        // 2. GITHUB: Get User (to know 'owner')
        // Retrieve user details using an action or client call?
        // Let's assume we can get 'owner' from the connection or just try creating repo in authenticated user's scope.

        let owner = "unknown";
        console.log(`\nCreating GitHub Repo: ${REPO_NAME}...`);
        try {
            const repo: any = await client.actions.execute({
                actionName: "GITHUB_CREATE_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER",
                requestBody: {
                    connectedAccountId: githubId,
                    input: {
                        name: REPO_NAME,
                        description: "Seeded data for Assemblr E2E",
                        private: false
                    }
                } as any
            });
            console.log("Repo Create Result: Success");
            // Extract owner from repo response
            if (repo && repo.owner && repo.owner.login) {
                owner = repo.owner.login;
            } else if (repo && repo.data && repo.data.owner && repo.data.owner.login) {
                owner = repo.data.owner.login;
            } else {
                owner = "AdityaHemanthVellanki"; // Fallback based on E2E discovery
            }
            console.log(`GitHub Owner (from Repo): ${owner}`);

        } catch (e: any) {
            console.log("Repo might already exist or failed:", e.message);
            // If repo exists, we still need owner.
            // Fallback for now: assume 'assemblr-e2e-test' or try to fetch?
            // Let's assume we can skip to Slack if owner is unknown?
        }

        if (owner !== "unknown") {
            const issues = ["Fix login bug", "Add dark mode", "Refactor API"];
            for (const title of issues) {
                await client.actions.execute({
                    actionName: "GITHUB_CREATE_AN_ISSUE",
                    requestBody: {
                        connectedAccountId: githubId,
                        input: {
                            owner,
                            repo: REPO_NAME,
                            title: title
                        }
                    } as any
                });
                process.stdout.write(".");
            }
            console.log("\nGitHub Issues Created.");
        }

        // 4. SLACK: Join & Post
        console.log(`\nJoining/Creating Slack Channel: ${SLACK_CHANNEL}...`);
        try {
            await client.actions.execute({
                actionName: "SLACK_JOIN_CONVERSATION",
                requestBody: {
                    connectedAccountId: slackId,
                    input: { channel: SLACK_CHANNEL }
                } as any
            });
        } catch (e) {
            try {
                await client.actions.execute({
                    actionName: "SLACK_CREATE_CHANNEL",
                    requestBody: {
                        connectedAccountId: slackId,
                        input: { name: SLACK_CHANNEL }
                    } as any
                });
            } catch (e2) { console.log("Slack channel issue (might exist):", e2); }
        }

        // We need channel ID usually, but name might work for some actions.
        // Start with posting to #general or verifying channel ID.
        console.log("Posting to Slack...");
        await client.actions.execute({
            actionName: "SLACK_CHAT_POST_MESSAGE",
            requestBody: {
                connectedAccountId: slackId,
                input: {
                    channel: SLACK_CHANNEL,
                    text: "Seeding complete for Assemblr E2E."
                }
            } as any
        });

        console.log("✅ Seeding Complete.");

    } catch (e: any) {
        console.error("❌ Seeding Failed:", e);
        if (e.data) console.error("Data:", JSON.stringify(e.data));
    }
}

main().catch(console.error);
