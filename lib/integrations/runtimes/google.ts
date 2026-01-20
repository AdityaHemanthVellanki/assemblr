import { z } from "zod";
import { IntegrationRuntime, Capability } from "@/lib/core/runtime";
import { Permission, checkPermission, DEV_PERMISSIONS } from "@/lib/core/permissions";
import { PermissionDeniedError } from "@/lib/core/errors";

export class GoogleRuntime implements IntegrationRuntime {
  id = "google";
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
    // Google Gmail List
    this.capabilities["google_gmail_list"] = {
      id: "google_gmail_list",
      integrationId: "google",
      paramsSchema: z.object({
        maxResults: z.number().optional(),
        q: z.string().optional(),
      }),
      execute: async (params, context, trace) => {
        const { token } = context;
        const maxResults = params.maxResults || 20;
        const q = params.q || "";
        
        // Gmail API requires query params
        const queryParams = new URLSearchParams();
        queryParams.append("maxResults", String(maxResults));
        if (q) queryParams.append("q", q);

        const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?${queryParams.toString()}`;
        
        const startTime = Date.now();
        let status: "success" | "error" = "success";
        
        try {
            const res = await fetch(url, {
              headers: { Authorization: `Bearer ${token}` }
            });
            
            if (!res.ok) {
                status = "error";
                const errorBody = await res.text();
                throw new Error(`Gmail API error: ${res.status} ${res.statusText} - ${errorBody}`);
            }
            
            const data = await res.json();
            // Fetch details for snippets if needed, but for now return list
            // Ideally we should fetch snippets in batch or let the UI handle it. 
            // The prompt says "Gmail integration executes real data".
            // The list endpoint only returns IDs and threadIds. 
            // We should probably fetch at least snippets.
            // But let's stick to the list for now to satisfy the capability contract.
            
            // Actually, to make "show my latest emails" useful, we need snippets.
            // Let's do a quick batch fetch for snippets if possible, or just map.
            // For a robust implementation, we might want to return the list and let the UI resolve details,
            // or return enriched data. Given "show my latest emails" implies seeing content:
            
            const messages = data.messages || [];
            if (messages.length > 0) {
                // Fetch first 5 details to show something useful? 
                // Or just return the list structure.
                // Let's return the raw list for now, the UI might bind to it.
                // If the user wants "Show table of emails", we need fields.
                // The capability definition in definitions.ts doesn't specify fields for google_gmail_list.
                // Wait, it does: "supportedFields": ["q", "maxResults", "includeSpamTrash"]
                // It doesn't define output schema.
                
                // Let's try to fetch details for the first few to populate a table
                const detailed = await Promise.all(messages.slice(0, 10).map(async (m: any) => {
                    try {
                        const dRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}`, {
                             headers: { Authorization: `Bearer ${token}` }
                        });
                        if (dRes.ok) return await dRes.json();
                        return m;
                    } catch { return m; }
                }));
                return detailed;
            }

            return messages;
        } catch (e) {
            status = "error";
            throw e;
        } finally {
            trace.logIntegrationAccess({
                integrationId: "google",
                capabilityId: "google_gmail_list",
                params,
                status,
                latency_ms: Date.now() - startTime,
                metadata: { url }
            });
        }
      }
    };

    // Google Drive List
    this.capabilities["google_drive_list"] = {
      id: "google_drive_list",
      integrationId: "google",
      paramsSchema: z.object({
        pageSize: z.number().optional(),
        q: z.string().optional(),
        orderBy: z.string().optional(),
      }),
      execute: async (params, context, trace) => {
        const { token } = context;
        const pageSize = params.pageSize || 100;
        const q = params.q || "";
        const orderBy = params.orderBy || "";

        const queryParams = new URLSearchParams();
        queryParams.append("pageSize", String(pageSize));
        if (q) queryParams.append("q", q);
        if (orderBy) queryParams.append("orderBy", orderBy);

        const url = `https://www.googleapis.com/drive/v3/files?${queryParams.toString()}`;

        const startTime = Date.now();
        let status: "success" | "error" = "success";

        try {
            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) {
                status = "error";
                throw new Error(`Google Drive API error: ${res.statusText}`);
            }
            const data = await res.json();
            return data.files || [];
        } catch (e) {
            status = "error";
            throw e;
        } finally {
            trace.logIntegrationAccess({
                integrationId: "google",
                capabilityId: "google_drive_list",
                params,
                status,
                latency_ms: Date.now() - startTime,
                metadata: { url }
            });
        }
      }
    };

    this.capabilities["google_gmail_reply"] = {
      id: "google_gmail_reply",
      integrationId: "google",
      paramsSchema: z.object({
        messageId: z.string(),
        body: z.string(),
        subject: z.string().optional(),
      }),
      execute: async (params, context, trace) => {
        const { token } = context;
        const startTime = Date.now();
        let status: "success" | "error" = "success";
        try {
          const messageRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${params.messageId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (!messageRes.ok) throw new Error(`Gmail API error: ${messageRes.statusText}`);
          const message = await messageRes.json();
          const headers = Array.isArray(message.payload?.headers) ? message.payload.headers : [];
          const fromHeader = headers.find((h: any) => h.name?.toLowerCase() === "from");
          const subjectHeader = headers.find((h: any) => h.name?.toLowerCase() === "subject");
          const to = fromHeader?.value ?? "";
          const subject = params.subject ?? `Re: ${subjectHeader?.value ?? ""}`.trim();
          const raw = buildRawEmail({ to, subject, body: params.body });
          const sendRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ raw, threadId: message.threadId }),
          });
          if (!sendRes.ok) throw new Error(`Gmail send error: ${sendRes.statusText}`);
          return await sendRes.json();
        } catch (e) {
          status = "error";
          throw e;
        } finally {
          trace.logIntegrationAccess({
            integrationId: "google",
            capabilityId: "google_gmail_reply",
            params,
            status,
            latency_ms: Date.now() - startTime,
          });
        }
      },
    };

    this.capabilities["google_gmail_archive"] = {
      id: "google_gmail_archive",
      integrationId: "google",
      paramsSchema: z.object({
        messageId: z.string(),
      }),
      execute: async (params, context, trace) => {
        const { token } = context;
        const startTime = Date.now();
        let status: "success" | "error" = "success";
        try {
          const res = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${params.messageId}/modify`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ removeLabelIds: ["INBOX"] }),
            },
          );
          if (!res.ok) throw new Error(`Gmail modify error: ${res.statusText}`);
          return await res.json();
        } catch (e) {
          status = "error";
          throw e;
        } finally {
          trace.logIntegrationAccess({
            integrationId: "google",
            capabilityId: "google_gmail_archive",
            params,
            status,
            latency_ms: Date.now() - startTime,
          });
        }
      },
    };

    this.capabilities["google_gmail_label"] = {
      id: "google_gmail_label",
      integrationId: "google",
      paramsSchema: z.object({
        messageId: z.string(),
        labelIds: z.array(z.string()),
      }),
      execute: async (params, context, trace) => {
        const { token } = context;
        const startTime = Date.now();
        let status: "success" | "error" = "success";
        try {
          const res = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${params.messageId}/modify`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ addLabelIds: params.labelIds }),
            },
          );
          if (!res.ok) throw new Error(`Gmail modify error: ${res.statusText}`);
          return await res.json();
        } catch (e) {
          status = "error";
          throw e;
        } finally {
          trace.logIntegrationAccess({
            integrationId: "google",
            capabilityId: "google_gmail_label",
            params,
            status,
            latency_ms: Date.now() - startTime,
          });
        }
      },
    };
  }
}

const WRITE_CAPABILITIES = new Set([
  "google_gmail_reply",
  "google_gmail_archive",
  "google_gmail_label",
]);

function buildRawEmail(params: { to: string; subject: string; body: string }) {
  const raw = [`To: ${params.to}`, `Subject: ${params.subject}`, "", params.body].join("\r\n");
  return Buffer.from(raw).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
