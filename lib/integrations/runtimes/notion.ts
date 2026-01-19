import { z } from "zod";
import { IntegrationRuntime, Capability } from "@/lib/core/runtime";

export class NotionRuntime implements IntegrationRuntime {
  id = "notion";
  capabilities: Record<string, Capability> = {};

  constructor() {
    this.registerCapabilities();
  }

  async resolveContext(token: string): Promise<Record<string, any>> {
    return { token };
  }

  private registerCapabilities() {
    this.capabilities["notion_databases_list"] = {
      id: "notion_databases_list",
      integrationId: "notion",
      paramsSchema: z.object({
        query: z.string().optional()
      }),
      execute: async (params, context) => {
        const { token } = context;
        const res = await fetch("https://api.notion.com/v1/search", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Notion-Version": "2022-06-28",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                query: params.query || "",
                filter: { value: "database", property: "object" },
                page_size: 100
            })
        });
        if (!res.ok) throw new Error(`Notion API Error: ${res.statusText}`);
        const json = await res.json();
        return json.results || [];
      }
    };
    
    this.capabilities["notion_pages_search"] = {
        id: "notion_pages_search",
        integrationId: "notion",
        paramsSchema: z.object({ query: z.string().optional() }),
        execute: async (params, context) => {
            const { token } = context;
            const res = await fetch("https://api.notion.com/v1/search", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Notion-Version": "2022-06-28",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    query: params.query || "",
                    filter: { value: "page", property: "object" },
                    page_size: 100
                })
            });
            if (!res.ok) {
                const errBody = await res.text();
                throw new Error(`Notion API Error: ${res.statusText} - ${errBody}`);
            }
            const json = await res.json();
            return json.results || [];
        }
    }
  }
}
