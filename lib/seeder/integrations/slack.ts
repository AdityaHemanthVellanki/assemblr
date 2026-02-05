import { SeederContext } from "../context";
import { SeederProfile } from "../types";
import { gen } from "../generator";
import { WebClient } from "@slack/web-api";

export class SlackSeeder {
    async run(ctx: SeederContext, profile: SeederProfile) {
        if (!ctx.slack) {
            ctx.log("warn", "Skipping Slack seeder: No client available");
            return;
        }

        ctx.log("info", `Starting Slack Seeder...`);
        // NOTE: Creating channels might fail if insufficient permissions
        // We try to create public channels.

        for (let i = 0; i < profile.slack.channelsPerTeam; i++) {
            const channelName = ("se-" + gen.repoName().toLowerCase().replace(/_/g, "-")).substring(0, 80); // Slack max length
            // Slack channels must be lowercase, no spaces, specialized chars.

            try {
                // Check if exists?
                // Just create.
                const res = await ctx.slack.conversations.create({ name: channelName });
                if (!res.ok) throw new Error(res.error);

                const channel = res.channel;
                ctx.log("info", `Created Slack Channel: #${channel.name}`);

                ctx.registry.add({
                    id: channel.id,
                    type: "slack_channel",
                    integration: "slack",
                    metadata: { name: channel.name }
                });

                // Seed Messages
                await this.seedMessages(ctx, profile, channel.id);

            } catch (e: any) {
                if (e.data?.error === "name_taken") {
                    ctx.log("warn", `Slack channel ${channelName} exists, skipping creation.`);
                    // Could try to find it and populate? But skip for now.
                } else {
                    ctx.log("error", `Slack Seeder failed for ${channelName}: ${e.message}`);
                }
            }
        }
    }

    async seedMessages(ctx: SeederContext, profile: SeederProfile, channelId: string) {
        for (let j = 0; j < profile.slack.messagesPerChannel; j++) {
            // Simulate "Incident" or "Discussion"
            const isIncident = Math.random() < profile.slack.incidentChance;
            let text = gen.technobabble();

            if (isIncident) {
                text = `🚨 INCIDENT: ${gen.issueTitle()} is down! Investigating...`;
            } else {
                // Maybe link a Linear Issue?
                const issue = ctx.registry.getRandom("linear_issue");
                if (issue) {
                    text += `\nReferencing ${issue.metadata.name}`; // Need key but stored name
                }
            }

            const res = await ctx.slack.chat.postMessage({
                channel: channelId,
                text
            });

            if (isIncident && res.ts) {
                // Thread
                await ctx.slack.chat.postMessage({
                    channel: channelId,
                    thread_ts: res.ts,
                    text: "Looking into logs..."
                });
                await ctx.slack.chat.postMessage({
                    channel: channelId,
                    thread_ts: res.ts,
                    text: "Fix deployed."
                });
            }
        }
    }
}
