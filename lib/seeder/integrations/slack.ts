/**
 * Slack bulk seeder — creates channels and messages via Composio.
 *
 * Used for profile-based bulk seeding (not scenario-based).
 */

import type { SeederContext } from "../context";
import type { SeederProfile } from "../types";
import { SEED_TAG } from "../types";
import { gen } from "../generator";
import { extractPayloadArray } from "@/lib/integrations/composio/execution";

export class SlackSeeder {
  async run(ctx: SeederContext, profile: SeederProfile) {
    if (!ctx.hasConnection("slack")) {
      ctx.log("warn", "Skipping Slack seeder: No connection available");
      return;
    }

    ctx.log("info", "Starting Slack Seeder...");

    // List existing channels to find targets
    const channelsResult = await ctx.execAction(
      "slack",
      "SLACKBOT_LIST_ALL_CHANNELS",
      { limit: 50 },
    );
    const channels = Array.isArray(channelsResult)
      ? channelsResult
      : extractPayloadArray(channelsResult);

    if (channels.length === 0) {
      ctx.log("warn", "No Slack channels found. Skipping.");
      return;
    }

    // Post seed messages into existing channels
    const targetChannels = channels.slice(0, Math.min(profile.slack.channelsPerTeam, channels.length));
    for (const channel of targetChannels) {
      ctx.registry.add({
        id: channel.id,
        type: "slack_channel",
        integration: "slack",
        metadata: { name: channel.name },
      });

      await this.seedMessages(ctx, profile, channel.id);
    }
  }

  private async seedMessages(ctx: SeederContext, profile: SeederProfile, channelId: string) {
    for (let j = 0; j < profile.slack.messagesPerChannel; j++) {
      try {
        const isIncident = Math.random() < profile.slack.incidentChance;
        let text = `${SEED_TAG} ${gen.technobabble()}`;

        if (isIncident) {
          text = `${SEED_TAG} :rotating_light: INCIDENT: ${gen.issueTitle()} is down! Investigating...`;
        } else {
          const issue = ctx.registry.getRandom("linear_issue");
          if (issue) {
            text += `\nReferencing Linear: ${issue.metadata.title || issue.id}`;
          }
        }

        const res = await ctx.execAction("slack", "SLACKBOT_SEND_MESSAGE", {
          channel: channelId,
          text,
        });

        // Add thread replies for incidents
        if (isIncident && res?.ts) {
          await ctx.execAction("slack", "SLACKBOT_SEND_MESSAGE", {
            channel: channelId,
            thread_ts: res.ts,
            text: `${SEED_TAG} Looking into logs...`,
          });
          await ctx.execAction("slack", "SLACKBOT_SEND_MESSAGE", {
            channel: channelId,
            thread_ts: res.ts,
            text: `${SEED_TAG} Fix deployed.`,
          });
        }
      } catch (e: any) {
        ctx.log("error", `Failed to send Slack message: ${e.message}`);
      }
    }
  }
}
