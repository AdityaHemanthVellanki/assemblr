
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { getComposioClient } from "@/lib/integrations/composio/client";

const USER_ID = "assemblr-e2e-test";
const REPO_NAME = "assemblr-seed-v1";
const SLACK_CHANNEL = "assemblr-seed-v1";

async function main() {
    const client = getComposioClient();
    console.log(`🚀 Starting E2E Workflow: GitHub Issues -> Slack Summary`);
    console.log(`User: ${USER_ID}`);

    // 1. Resolve Connection IDs (ACTIVE only)
    const accounts = await client.connectedAccounts.list({ userUuid: USER_ID } as any);

    // GitHub
    const githubConn = accounts.items.find((a: any) => (a.appUniqueId === "github" || a.appName === "github") && a.status === "ACTIVE");
    if (!githubConn) throw new Error("No ACTIVE GitHub connection found");
    const githubId = githubConn.id;

    // Slack
    const slackConn = accounts.items.find((a: any) =>
        (a.appUniqueId === "slack" || a.appName === "slack" || a.appUniqueId === "slackbot" || a.appName === "slackbot")
        && a.status === "ACTIVE"
    );
    if (!slackConn) throw new Error("No ACTIVE Slack connection found");
    const slackId = slackConn.id;

    console.log(`✅ Connections Resolved: GitHub (${githubId}) -> Slack (${slackId})`);

    try {
        // 2. READ: Get Owner Login (Workaround using List Repos)
        const repos: any = await client.actions.execute({
            actionName: "GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER",
            requestBody: {
                connectedAccountId: githubId,
                input: { type: "public", per_page: 1 }
            } as any
        });

        let owner = "";
        // Extract owner from repo list response
        const repoList = repos.data?.repositories || repos.repositories || repos || [];
        if (repoList.length > 0 && repoList[0].owner) {
            owner = repoList[0].owner.login;
        } else {
            // Fallback if list empty? Maybe seed repo exists?
            // Or try to just assume user ID?
            // For E2E seed, we know the user is usually the authenticated one.
            console.log("Could not extract owner from repo list. Trying hardcoded fallback or user info.");
            // If we can't find owner, maybe we can assume it from previous seed logs?
            // But let's throw for now if critical.
        }

        if (!owner) throw new Error("Could not determine GitHub owner login from repo list");
        console.log(`GitHub Owner: ${owner}`);

        // 3. READ: List Issues from Repo
        console.log(`\n📥 Fetching issues from ${owner}/${REPO_NAME}...`);
        const issuesResult: any = await client.actions.execute({
            actionName: "GITHUB_LIST_REPOSITORY_ISSUES",
            requestBody: {
                connectedAccountId: githubId,
                input: {
                    owner: owner,
                    repo: REPO_NAME,
                    state: "open"
                }
            } as any
        });

        const issues = issuesResult.data?.details || issuesResult.details || issuesResult.data || issuesResult || [];

        // Handle pagination or details array
        const issueList = Array.isArray(issues) ? issues : (issues.items || []);

        console.log(`Found ${issueList.length} issues.`);

        // 4. PROCESS: Summarize
        const summary = issueList.slice(0, 5).map((i: any) => `- #${i.number} ${i.title}`).join("\n");
        const message = `*E2E Test Report* 🤖\n\nFound *${issueList.length}* open issues in \`${owner}/${REPO_NAME}\`:\n${summary}\n\n_Validated via Assemblr E2E Protocol_`;

        // 5. WRITE: Post to Slack
        console.log(`\n📤 Posting summary to Slack #${SLACK_CHANNEL}...`);
        await client.actions.execute({
            actionName: "SLACK_CHAT_POST_MESSAGE",
            requestBody: {
                connectedAccountId: slackId,
                input: {
                    channel: SLACK_CHANNEL,
                    text: message
                }
            } as any
        });

        console.log(`✅ E2E Workflow Complete! Check Slack channel #${SLACK_CHANNEL}.`);

    } catch (e: any) {
        console.error("❌ E2E Failed:", e);
        if (e.data) console.error("Data:", JSON.stringify(e.data));
    }
}

main().catch(console.error);
