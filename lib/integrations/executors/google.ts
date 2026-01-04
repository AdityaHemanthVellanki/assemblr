import { IntegrationExecutor, ExecutionResult, ExecutorInput } from "@/lib/execution/types";

export class GoogleExecutor implements IntegrationExecutor {
  async execute(input: ExecutorInput): Promise<ExecutionResult> {
    const { plan, credentials } = input;
    const token = credentials.access_token as string;

    if (!token) {
      return {
        viewId: plan.viewId,
        status: "error",
        error: "Missing Google access token",
        timestamp: new Date().toISOString(),
        source: "google",
      };
    }

    try {
      let data: unknown[] = [];

      if (plan.resource === "drive" || plan.resource === "files") {
        const res = await fetch("https://www.googleapis.com/drive/v3/files?pageSize=100", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Google Drive API error: ${res.statusText}`);
        const json = await res.json();
        data = json.files || [];
      } else if (plan.resource === "gmail" || plan.resource === "messages") {
        const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Gmail API error: ${res.statusText}`);
        const json = await res.json();
        data = json.messages || [];
      } else {
        throw new Error(`Unsupported Google resource: ${plan.resource}`);
      }

      return {
        viewId: plan.viewId,
        status: "success",
        rows: data,
        source: "live_api",
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      return {
        viewId: plan.viewId,
        status: "error",
        rows: [],
        source: "live_api",
        error: err instanceof Error ? err.message : "Unknown Google error",
        timestamp: new Date().toISOString(),
      };
    }
  }
}
