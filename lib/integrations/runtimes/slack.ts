import { z } from "zod";
import { IntegrationRuntime, Capability } from "@/lib/core/runtime";
import { Permission, checkPermission, DEV_PERMISSIONS } from "@/lib/core/permissions";
import { PermissionDeniedError } from "@/lib/core/errors";

export class SlackRuntime implements IntegrationRuntime {
  id = "slack";
  capabilities: Record<string, Capability> = {};

  constructor() {
    this.registerCapabilities();
  }

  checkPermissions(capabilityId: string, userPermissions: Permission[]) {
    const perms = userPermissions && userPermissions.length > 0 ? userPermissions : DEV_PERMISSIONS;
    const access = WRITE_CAPABILITIES.has(capabilityId) ? "write" : "read";
    const allowed = checkPermission(perms, this.id, capabilityId, access);
    if (!allowed) {
      throw new PermissionDeniedError(this.id, capabilityId);
    }
  }

  async resolveContext(token: string): Promise<Record<string, any>> {
    return { token };
  }

  private registerCapabilities() {
    this.capabilities["slack_channels_list"] = {
      id: "slack_channels_list",
      integrationId: "slack",
      paramsSchema: z.object({
        limit: z.number().optional(),
        types: z.string().optional()
      }),
      execute: async (params, context) => {
        const { token } = context;
        const limit = params.limit || 100;
        const types = params.types || "public_channel";
        
        const url = `https://slack.com/api/conversations.list?limit=${limit}&types=${types}`;
        console.log(`[Slack] Fetching channels: ${url}`);
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || "Slack API Error");
        return json.channels || [];
      }
    };

    this.capabilities["slack_messages_list"] = {
        id: "slack_messages_list",
        integrationId: "slack",
        paramsSchema: z.object({
            channel: z.string().optional(),
            limit: z.number().optional()
        }),
        execute: async (params, context) => {
            const { token } = context;
            let channelId = params.channel;

            // 1. Resolve Channel ID if missing or name
            if (!channelId || !channelId.startsWith("C")) {
                 const listRes = await fetch(`https://slack.com/api/conversations.list?limit=100&types=public_channel`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const listJson = await listRes.json();
                if (!listJson.ok) throw new Error(`Slack API Error (List Channels): ${listJson.error}`);
                
                const channels = listJson.channels || [];
                
                if (channelId) {
                    // Find by name
                    const match = channels.find((c: any) => c.name === channelId || c.name === channelId.replace("#", ""));
                    if (match) channelId = match.id;
                    else {
                        const available = channels.map((c: any) => c.name).join(", ");
                        throw new Error(`Channel '${channelId}' not found. Available public channels: ${available}`);
                    }
                } else {
                    // Default to 'general' or first
                    const general = channels.find((c: any) => c.name === "general");
                    channelId = general ? general.id : channels[0]?.id;
                }
            }

            if (!channelId) throw new Error("No channel found to list messages from");

            // 2. Fetch History
            const limit = params.limit || 20;
            const res = await fetch(`https://slack.com/api/conversations.history?channel=${channelId}&limit=${limit}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const json = await res.json();
            if (!json.ok) throw new Error(`Slack API Error (History): ${json.error}`);
            
            return json.messages || [];
        }
    };

    this.capabilities["slack_post_message"] = {
        id: "slack_post_message",
        integrationId: "slack",
        paramsSchema: z.object({
            channel: z.string(),
            text: z.string(),
        }),
        execute: async (params, context) => {
            const { token } = context;
            const res = await fetch("https://slack.com/api/chat.postMessage", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ channel: params.channel, text: params.text }),
            });
            const json = await res.json();
            if (!json.ok) throw new Error(`Slack API Error: ${json.error}`);
            return json;
        }
    };

    this.capabilities["slack_reply_thread"] = {
        id: "slack_reply_thread",
        integrationId: "slack",
        paramsSchema: z.object({
            channel: z.string(),
            threadTs: z.string(),
            text: z.string(),
        }),
        execute: async (params, context) => {
            const { token } = context;
            const res = await fetch("https://slack.com/api/chat.postMessage", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ channel: params.channel, text: params.text, thread_ts: params.threadTs }),
            });
            const json = await res.json();
            if (!json.ok) throw new Error(`Slack API Error: ${json.error}`);
            return json;
        }
    };

    this.capabilities["slack_add_reaction"] = {
        id: "slack_add_reaction",
        integrationId: "slack",
        paramsSchema: z.object({
            channel: z.string(),
            timestamp: z.string(),
            name: z.string(),
        }),
        execute: async (params, context) => {
            const { token } = context;
            const res = await fetch("https://slack.com/api/reactions.add", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ channel: params.channel, timestamp: params.timestamp, name: params.name }),
            });
            const json = await res.json();
            if (!json.ok) throw new Error(`Slack API Error: ${json.error}`);
            return json;
        }
    };
  }
}

const WRITE_CAPABILITIES = new Set([
  "slack_post_message",
  "slack_reply_thread",
  "slack_add_reaction",
]);
