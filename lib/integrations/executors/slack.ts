import { IntegrationExecutor, ExecutionResult, ExecutorInput } from "@/lib/execution/types";

export class SlackExecutor implements IntegrationExecutor {
  async execute(input: ExecutorInput): Promise<ExecutionResult> {
    const { plan, credentials } = input;
    const token = credentials.access_token as string;

    if (!token) {
      return {
        viewId: plan.viewId,
        status: "error",
        error: "Missing Slack access token",
        timestamp: new Date().toISOString(),
        source: "slack",
      };
    }

    try {
      let data: unknown[] = [];

      if (plan.resource === "channels") {
        const res = await fetch("https://slack.com/api/conversations.list", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!json.ok) throw new Error(`Slack API error: ${json.error}`);
        data = json.channels || [];
      } else {
        // Fallback: Try to call the resource as a Slack API method (e.g. "users_list" -> "users.list")
        const method = plan.resource.replace(/_/g, ".");
        const res = await fetch(`https://slack.com/api/${method}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!json.ok) throw new Error(`Slack API error: ${json.error}`);
        
        // Slack responses usually have a key matching the resource name or "members" for users
        // We'll try to find an array in the response
        const possibleKeys = Object.keys(json).filter(k => Array.isArray(json[k]));
        if (possibleKeys.length > 0) {
           data = json[possibleKeys[0]];
        } else {
           // If no array found, just wrap the whole response
           data = [json];
        }
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
        error: err instanceof Error ? err.message : "Unknown Slack error",
        timestamp: new Date().toISOString(),
      };
    }
  }
}
