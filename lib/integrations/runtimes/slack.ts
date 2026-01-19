import { z } from "zod";
import { IntegrationRuntime, Capability } from "@/lib/core/runtime";

export class SlackRuntime implements IntegrationRuntime {
  id = "slack";
  capabilities: Record<string, Capability> = {};

  constructor() {
    this.registerCapabilities();
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
        const types = params.types || "public_channel,private_channel";
        
        const res = await fetch(`https://slack.com/api/conversations.list?limit=${limit}&types=${types}`, {
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
            // Need channel ID. If not provided, we can't list messages easily without listing channels first.
            // But let's assume channel ID is passed or we default to something.
            throw new Error("Channel ID required for messages list");
        }
    }
  }
}
