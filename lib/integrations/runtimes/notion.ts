import { z } from "zod";
import { IntegrationRuntime, Capability } from "@/lib/core/runtime";
import { Permission, checkPermission, DEV_PERMISSIONS } from "@/lib/core/permissions";
import { PermissionDeniedError } from "@/lib/core/errors";

export class NotionRuntime implements IntegrationRuntime {
  id = "notion";
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
    };

    this.capabilities["notion_page_create"] = {
        id: "notion_page_create",
        integrationId: "notion",
        paramsSchema: z.object({
            parentId: z.string(),
            parentType: z.enum(["database", "page"]).optional(),
            properties: z.record(z.string(), z.any()),
            children: z.array(z.any()).optional(),
        }),
        execute: async (params, context) => {
            const { token } = context;
            const parent = params.parentType === "page" ? { page_id: params.parentId } : { database_id: params.parentId };
            const res = await fetch("https://api.notion.com/v1/pages", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Notion-Version": "2022-06-28",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    parent,
                    properties: params.properties,
                    children: params.children ?? []
                })
            });
            if (!res.ok) {
                const errBody = await res.text();
                throw new Error(`Notion API Error: ${res.statusText} - ${errBody}`);
            }
            return await res.json();
        }
    };

    this.capabilities["notion_page_update"] = {
        id: "notion_page_update",
        integrationId: "notion",
        paramsSchema: z.object({
            pageId: z.string(),
            properties: z.record(z.string(), z.any()),
        }),
        execute: async (params, context) => {
            const { token } = context;
            const res = await fetch(`https://api.notion.com/v1/pages/${params.pageId}`, {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Notion-Version": "2022-06-28",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ properties: params.properties })
            });
            if (!res.ok) {
                const errBody = await res.text();
                throw new Error(`Notion API Error: ${res.statusText} - ${errBody}`);
            }
            return await res.json();
        }
    };

    this.capabilities["notion_block_append"] = {
        id: "notion_block_append",
        integrationId: "notion",
        paramsSchema: z.object({
            blockId: z.string(),
            children: z.array(z.any()),
        }),
        execute: async (params, context) => {
            const { token } = context;
            const res = await fetch(`https://api.notion.com/v1/blocks/${params.blockId}/children`, {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Notion-Version": "2022-06-28",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ children: params.children })
            });
            if (!res.ok) {
                const errBody = await res.text();
                throw new Error(`Notion API Error: ${res.statusText} - ${errBody}`);
            }
            return await res.json();
        }
    };
  }
}

const WRITE_CAPABILITIES = new Set([
  "notion_page_create",
  "notion_page_update",
  "notion_block_append",
]);
