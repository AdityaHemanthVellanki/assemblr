import { SchemaDiscoverer } from "@/lib/schema/discovery";
import { DiscoveredSchema } from "@/lib/schema/types";

export const slackDiscoverer: SchemaDiscoverer = {
  async discoverSchemas({ credentials }) {
    const schemas: DiscoveredSchema[] = [
      {
        integrationId: "slack",
        resource: "channels",
        fields: [
          { name: "id", type: "string", nullable: false },
          { name: "name", type: "string", nullable: false },
          { name: "is_private", type: "boolean", nullable: false },
          { name: "member_count", type: "number", nullable: false },
          { name: "created", type: "date", nullable: false },
        ]
      },
      {
        integrationId: "slack",
        resource: "users",
        fields: [
          { name: "id", type: "string", nullable: false },
          { name: "name", type: "string", nullable: false },
          { name: "real_name", type: "string", nullable: true },
          { name: "is_bot", type: "boolean", nullable: false },
          { name: "email", type: "string", nullable: true },
        ]
      },
      {
        integrationId: "slack",
        resource: "messages",
        fields: [
          { name: "ts", type: "string", nullable: false }, // Timestamp ID
          { name: "channel_id", type: "string", nullable: false },
          { name: "user_id", type: "string", nullable: false },
          { name: "text", type: "string", nullable: true },
          { name: "thread_ts", type: "string", nullable: true },
        ]
      }
    ];

    return schemas;
  }
};
