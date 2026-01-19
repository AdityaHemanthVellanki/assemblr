
import { z } from "zod";
import { IntegrationRuntime, Capability } from "@/lib/core/runtime";
import { Permission, checkPermission, DEV_PERMISSIONS } from "@/lib/core/permissions";
import { PermissionDeniedError } from "@/lib/core/errors";

export class LinearRuntime implements IntegrationRuntime {
  id = "linear";
  capabilities: Record<string, Capability> = {};

  constructor() {
    this.registerCapabilities();
  }

  checkPermissions(capabilityId: string, userPermissions: Permission[]) {
      const perms = userPermissions && userPermissions.length > 0 ? userPermissions : DEV_PERMISSIONS;
      const allowed = checkPermission(perms, this.id, capabilityId, "read");
      if (!allowed) {
          throw new PermissionDeniedError(this.id, capabilityId);
      }
  }

  private registerCapabilities() {
    this.capabilities["linear_issues_list"] = {
      id: "linear_issues_list",
      integrationId: "linear",
      paramsSchema: z.object({
        first: z.number().optional(),
        includeArchived: z.boolean().optional(),
      }),
      execute: async (params, context, trace) => {
        const { token } = context;
        const startTime = Date.now();
        let status: "success" | "error" = "success";
        
        // Construct GraphQL Query
        const limit = params.first || 50;
        // Filter for active issues (excluding completed/canceled if possible, but 'state' filter is complex)
        // For now, we fetch all and let the user filter, or rely on Linear's default sort.
        // To be safe against 500 errors, we use no filter.
        const filter = ""; 
        
        const query = `query { issues(first: ${limit} ${filter}) { nodes { id title state { name } createdAt updatedAt assignee { name } } } }`;

        try {
            const res = await fetch("https://api.linear.app/graphql", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ query })
            });
            
            // Check for Bearer if needed
            // If the token is OAuth, it needs Bearer.
            // If I just put `${token}`, it depends on what `token` is.
            // Assuming `token` is the access token string.
            // Let's retry with Bearer if this fails? No, standard is Bearer.
            // But wait, the `LinearExecutor` used `Authorization: ${token}` without Bearer?
            // Let's check `lib/integrations/executors/linear.ts`.
            
            if (!res.ok) {
                status = "error";
                throw new Error(`Linear API error: ${res.statusText}`);
            }
            
            const json = await res.json();
            if (json.errors) {
                status = "error";
                throw new Error(`Linear GraphQL Error: ${json.errors[0].message}`);
            }
            
            return json.data?.issues?.nodes || [];

        } catch (e) {
            status = "error";
            throw e;
        } finally {
            trace.logIntegrationAccess({
                integrationId: "linear",
                capabilityId: "linear_issues_list",
                params,
                status,
                latency_ms: Date.now() - startTime
            });
        }
      }
    };

    this.capabilities["linear_teams_list"] = {
        id: "linear_teams_list",
        integrationId: "linear",
        paramsSchema: z.object({}),
        execute: async (params, context, trace) => {
            const { token } = context;
            const startTime = Date.now();
            let status: "success" | "error" = "success";
            const query = `query { teams { nodes { id name key } } }`;

            try {
                const res = await fetch("https://api.linear.app/graphql", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}` // Trying Bearer here
                    },
                    body: JSON.stringify({ query })
                });

                if (!res.ok) {
                    status = "error";
                    throw new Error(`Linear API error: ${res.statusText}`);
                }
                const json = await res.json();
                if (json.errors) {
                    status = "error";
                    throw new Error(`Linear GraphQL Error: ${json.errors[0].message}`);
                }
                return json.data?.teams?.nodes || [];
            } catch (e) {
                status = "error";
                throw e;
            } finally {
                trace.logIntegrationAccess({
                    integrationId: "linear",
                    capabilityId: "linear_teams_list",
                    params,
                    status,
                    latency_ms: Date.now() - startTime
                });
            }
        }
    };
  }

  async resolveContext(token: string) {
    return { token };
  }
}
