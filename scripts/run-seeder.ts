import { config } from "dotenv";
config({ path: ".env.local" });

import { bootstrapRealUserSession } from "./auth-bootstrap";
import { Octokit } from "@octokit/rest";
import { SeederContext } from "@/lib/seeder/context";
import { EntityRegistry } from "@/lib/seeder/registry";
import { PROFILES } from "@/lib/seeder/profiles";
import { GitHubSeeder } from "@/lib/seeder/integrations/github";
import { LinearSeeder } from "@/lib/seeder/integrations/linear";
import { SeederLog } from "@/lib/seeder/types";

// Stub for token retrieval since we moved to Composio and it hides tokens.
async function getValidAccessToken(orgId: string, integrationId: string): Promise<string> {
    console.warn(`[Seeder] Skipping token retrieval for ${integrationId} (Composio Managed). Seeding might fail if raw token is needed.`);
    throw new Error("Raw token retrieval not supported with Composio yet.");
}
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { LinearClient } from "@linear/sdk";
import { WebClient } from "@slack/web-api";
import { SlackSeeder } from "@/lib/seeder/integrations/slack";
import { Client } from "@notionhq/client";
import { NotionSeeder } from "@/lib/seeder/integrations/notion";

async function run() {
    console.log("🌱 Starting Synthetic Enterprise Seeder...");

    // 1. Bootstrap Auth
    const { user, orgId } = await bootstrapRealUserSession();
    const supabase = createSupabaseAdminClient();
    console.log(`✅ Authenticated as ${user.email} (Org: ${orgId})`);

    // 2. Prepare Clients
    let githubClient: Octokit | undefined;
    try {
        const githubToken = await getValidAccessToken(orgId, "github");
        githubClient = new Octokit({ auth: githubToken });
        console.log("✅ GitHub Client Initialized");
    } catch (e) {
        console.warn("⚠️ GitHub not connected or token invalid");
    }

    let linearClient: LinearClient | undefined;
    try {
        const linearToken = await getValidAccessToken(orgId, "linear");
        linearClient = new LinearClient({ accessToken: linearToken });
        console.log("✅ Linear Client Initialized");
    } catch (e) {
        console.warn("⚠️ Linear not connected or token invalid");
    }

    let slackClient: WebClient | undefined;
    try {
        const slackToken = await getValidAccessToken(orgId, "slack");
        slackClient = new WebClient(slackToken);
        console.log("✅ Slack Client Initialized");
    } catch (e) {
        console.warn("⚠️ Slack not connected or token invalid");
    }

    let notionClient: Client | undefined;
    try {
        const notionToken = await getValidAccessToken(orgId, "notion");
        notionClient = new Client({ auth: notionToken });
        console.log("✅ Notion Client Initialized");
    } catch (e) {
        console.warn("⚠️ Notion not connected or token invalid");
    }

    // 3. Build Context
    const registry = new EntityRegistry();
    const log: SeederLog = (level, msg) => console.log(`[${level.toUpperCase()}] ${msg}`);

    const ctx: SeederContext = {
        registry,
        log,
        supabase,
        orgId,
        github: githubClient,
        linear: linearClient,
        slack: slackClient,
        notion: notionClient
    };

    // 4. Select Profile
    const profileName = process.env.SEEDER_PROFILE || "startup";
    const profile = PROFILES[profileName];
    if (!profile) throw new Error(`Unknown profile: ${profileName}`);

    console.log(`🚀 Seeding Profile: ${profile.name}`);

    // 5. Run Seeders
    const githubSeeder = new GitHubSeeder();
    await githubSeeder.run(ctx, profile);

    const linearSeeder = new LinearSeeder();
    await linearSeeder.run(ctx, profile);

    const slackSeeder = new SlackSeeder();
    await slackSeeder.run(ctx, profile);

    const notionSeeder = new NotionSeeder();
    await notionSeeder.run(ctx, profile);

    // 6. Save Registry
    const manifestPath = await registry.saveManifest(orgId, Date.now().toString());
    console.log(`💾 Manifest saved to ${manifestPath}`);
}

run().catch(console.error);
