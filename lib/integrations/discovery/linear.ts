import { SchemaDiscoverer } from "@/lib/schema/discovery";
import { DiscoveredSchema } from "@/lib/schema/types";

export const linearDiscoverer: SchemaDiscoverer = {
  async discoverSchemas({ credentials }) {
    const schemas: DiscoveredSchema[] = [
      {
        integrationId: "linear",
        resource: "issues",
        fields: [
          { name: "id", type: "string", nullable: false },
          { name: "identifier", type: "string", nullable: false }, // ENG-123
          { name: "title", type: "string", nullable: false },
          { name: "description", type: "string", nullable: true },
          { name: "state", type: "string", nullable: false },
          { name: "priority", type: "number", nullable: false },
          { name: "assignee", type: "string", nullable: true }, // User ID
          { name: "creator", type: "string", nullable: false },
          { name: "created_at", type: "date", nullable: false },
          { name: "updated_at", type: "date", nullable: false },
        ]
      },
      {
        integrationId: "linear",
        resource: "projects",
        fields: [
          { name: "id", type: "string", nullable: false },
          { name: "name", type: "string", nullable: false },
          { name: "state", type: "string", nullable: false },
          { name: "progress", type: "number", nullable: false },
          { name: "start_date", type: "date", nullable: true },
          { name: "target_date", type: "date", nullable: true },
        ]
      },
      {
        integrationId: "linear",
        resource: "cycles",
        fields: [
          { name: "id", type: "string", nullable: false },
          { name: "number", type: "number", nullable: false },
          { name: "starts_at", type: "date", nullable: false },
          { name: "ends_at", type: "date", nullable: false },
        ]
      },
      {
        integrationId: "linear",
        resource: "teams",
        fields: [
          { name: "id", type: "string", nullable: false },
          { name: "name", type: "string", nullable: false },
          { name: "key", type: "string", nullable: false },
        ]
      }
    ];

    return schemas;
  }
};
