
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
      const access = WRITE_CAPABILITIES.has(capabilityId) ? "write" : "read";
      const allowed = checkPermission(perms, this.id, capabilityId, access);
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
        assigneeId: z.string().optional(),
        teamId: z.string().optional(),
        cycleId: z.string().optional(),
        stateId: z.string().optional(),
        completedAfter: z.string().optional(),
        completedBefore: z.string().optional(),
        updatedAfter: z.string().optional(),
        updatedBefore: z.string().optional(),
        labels: z.array(z.string()).optional(),
      }),
      execute: async (params, context, trace) => {
        const { token } = context;
        const startTime = Date.now();
        let status: "success" | "error" = "success";
        const limit = params.first || 50;
        const filter: Record<string, any> = {};
        if (params.assigneeId) filter.assignee = { id: { eq: params.assigneeId } };
        if (params.teamId) filter.team = { id: { eq: params.teamId } };
        if (params.cycleId) filter.cycle = { id: { eq: params.cycleId } };
        if (params.stateId) filter.state = { id: { eq: params.stateId } };
        if (params.completedAfter || params.completedBefore) {
            filter.completedAt = {
                ...(params.completedAfter ? { gte: params.completedAfter } : {}),
                ...(params.completedBefore ? { lte: params.completedBefore } : {}),
            };
        }
        if (params.updatedAfter || params.updatedBefore) {
            filter.updatedAt = {
                ...(params.updatedAfter ? { gte: params.updatedAfter } : {}),
                ...(params.updatedBefore ? { lte: params.updatedBefore } : {}),
            };
        }
        if (params.labels && params.labels.length > 0) {
            filter.labels = { some: { name: { in: params.labels } } };
        }
        const query = `
          query Issues($first: Int, $filter: IssueFilter) {
            issues(first: $first, filter: $filter) {
              nodes {
                id
                identifier
                title
                state { id name }
                createdAt
                updatedAt
                completedAt
                assignee { id name }
                project { id name }
                cycle { id name startsAt endsAt }
              }
            }
          }
        `;

        try {
            const res = await fetch("https://api.linear.app/graphql", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ query, variables: { first: limit, filter: Object.keys(filter).length ? filter : undefined } })
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

    this.capabilities["linear_projects_list"] = {
        id: "linear_projects_list",
        integrationId: "linear",
        paramsSchema: z.object({
            first: z.number().optional(),
            includeArchived: z.boolean().optional(),
        }),
        execute: async (params, context, trace) => {
            const { token } = context;
            const startTime = Date.now();
            let status: "success" | "error" = "success";
            const limit = params.first || 50;
            const query = `
              query Projects($first: Int, $includeArchived: Boolean) {
                projects(first: $first, includeArchived: $includeArchived) {
                  nodes { id name state startDate targetDate }
                }
              }
            `;
            try {
                const res = await fetch("https://api.linear.app/graphql", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ query, variables: { first: limit, includeArchived: params.includeArchived ?? false } })
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
                return json.data?.projects?.nodes || [];
            } catch (e) {
                status = "error";
                throw e;
            } finally {
                trace.logIntegrationAccess({
                    integrationId: "linear",
                    capabilityId: "linear_projects_list",
                    params,
                    status,
                    latency_ms: Date.now() - startTime
                });
            }
        }
    };

    this.capabilities["linear_cycles_list"] = {
        id: "linear_cycles_list",
        integrationId: "linear",
        paramsSchema: z.object({
            first: z.number().optional(),
            includeArchived: z.boolean().optional(),
        }),
        execute: async (params, context, trace) => {
            const { token } = context;
            const startTime = Date.now();
            let status: "success" | "error" = "success";
            const limit = params.first || 50;
            const query = `
              query Cycles($first: Int, $includeArchived: Boolean) {
                cycles(first: $first, includeArchived: $includeArchived) {
                  nodes { id name startsAt endsAt }
                }
              }
            `;
            try {
                const res = await fetch("https://api.linear.app/graphql", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ query, variables: { first: limit, includeArchived: params.includeArchived ?? false } })
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
                return json.data?.cycles?.nodes || [];
            } catch (e) {
                status = "error";
                throw e;
            } finally {
                trace.logIntegrationAccess({
                    integrationId: "linear",
                    capabilityId: "linear_cycles_list",
                    params,
                    status,
                    latency_ms: Date.now() - startTime
                });
            }
        }
    };

    this.capabilities["linear_labels_list"] = {
        id: "linear_labels_list",
        integrationId: "linear",
        paramsSchema: z.object({
            first: z.number().optional(),
        }),
        execute: async (params, context, trace) => {
            const { token } = context;
            const startTime = Date.now();
            let status: "success" | "error" = "success";
            const limit = params.first || 50;
            const query = `
              query Labels($first: Int) {
                issueLabels(first: $first) {
                  nodes { id name }
                }
              }
            `;
            try {
                const res = await fetch("https://api.linear.app/graphql", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ query, variables: { first: limit } })
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
                return json.data?.issueLabels?.nodes || [];
            } catch (e) {
                status = "error";
                throw e;
            } finally {
                trace.logIntegrationAccess({
                    integrationId: "linear",
                    capabilityId: "linear_labels_list",
                    params,
                    status,
                    latency_ms: Date.now() - startTime
                });
            }
        }
    };

    this.capabilities["linear_workflow_states_list"] = {
        id: "linear_workflow_states_list",
        integrationId: "linear",
        paramsSchema: z.object({
            first: z.number().optional(),
        }),
        execute: async (params, context, trace) => {
            const { token } = context;
            const startTime = Date.now();
            let status: "success" | "error" = "success";
            const limit = params.first || 50;
            const query = `
              query WorkflowStates($first: Int) {
                workflowStates(first: $first) {
                  nodes { id name type }
                }
              }
            `;
            try {
                const res = await fetch("https://api.linear.app/graphql", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ query, variables: { first: limit } })
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
                return json.data?.workflowStates?.nodes || [];
            } catch (e) {
                status = "error";
                throw e;
            } finally {
                trace.logIntegrationAccess({
                    integrationId: "linear",
                    capabilityId: "linear_workflow_states_list",
                    params,
                    status,
                    latency_ms: Date.now() - startTime
                });
            }
        }
    };

    this.capabilities["linear_issue_update_status"] = {
        id: "linear_issue_update_status",
        integrationId: "linear",
        paramsSchema: z.object({
            issueId: z.string(),
            stateId: z.string(),
        }),
        execute: async (params, context, trace) => {
            const { token } = context;
            const startTime = Date.now();
            let status: "success" | "error" = "success";
            const query = `mutation IssueUpdate($id: String!, $stateId: String!) { issueUpdate(id: $id, input: { stateId: $stateId }) { success issue { id state { id name } } } }`;
            try {
                const res = await fetch("https://api.linear.app/graphql", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ query, variables: { id: params.issueId, stateId: params.stateId } }),
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
                return json.data?.issueUpdate ?? {};
            } catch (e) {
                status = "error";
                throw e;
            } finally {
                trace.logIntegrationAccess({
                    integrationId: "linear",
                    capabilityId: "linear_issue_update_status",
                    params,
                    status,
                    latency_ms: Date.now() - startTime
                });
            }
        }
    };

    this.capabilities["linear_issue_assign"] = {
        id: "linear_issue_assign",
        integrationId: "linear",
        paramsSchema: z.object({
            issueId: z.string(),
            assigneeId: z.string(),
        }),
        execute: async (params, context, trace) => {
            const { token } = context;
            const startTime = Date.now();
            let status: "success" | "error" = "success";
            const query = `mutation IssueAssign($id: String!, $assigneeId: String!) { issueUpdate(id: $id, input: { assigneeId: $assigneeId }) { success issue { id assignee { id name } } } }`;
            try {
                const res = await fetch("https://api.linear.app/graphql", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ query, variables: { id: params.issueId, assigneeId: params.assigneeId } }),
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
                return json.data?.issueUpdate ?? {};
            } catch (e) {
                status = "error";
                throw e;
            } finally {
                trace.logIntegrationAccess({
                    integrationId: "linear",
                    capabilityId: "linear_issue_assign",
                    params,
                    status,
                    latency_ms: Date.now() - startTime
                });
            }
        }
    };

    this.capabilities["linear_issue_comment"] = {
        id: "linear_issue_comment",
        integrationId: "linear",
        paramsSchema: z.object({
            issueId: z.string(),
            body: z.string(),
        }),
        execute: async (params, context, trace) => {
            const { token } = context;
            const startTime = Date.now();
            let status: "success" | "error" = "success";
            const query = `mutation CommentCreate($issueId: String!, $body: String!) { commentCreate(input: { issueId: $issueId, body: $body }) { success comment { id body } } }`;
            try {
                const res = await fetch("https://api.linear.app/graphql", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ query, variables: { issueId: params.issueId, body: params.body } }),
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
                return json.data?.commentCreate ?? {};
            } catch (e) {
                status = "error";
                throw e;
            } finally {
                trace.logIntegrationAccess({
                    integrationId: "linear",
                    capabilityId: "linear_issue_comment",
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

const WRITE_CAPABILITIES = new Set([
  "linear_issue_update_status",
  "linear_issue_assign",
  "linear_issue_comment",
]);
