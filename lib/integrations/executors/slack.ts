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
        source: "live_api",
        rows: [],
      };
    }

    try {
      let data: unknown[] = [];

      // Universal Capability Executor
      const resource = plan.resource || "";
      
      // Slack usually uses method paths like "conversations.list"
      // If resource is "messages", maybe we map to "conversations.history"
      let method = resource.replace(/_/g, ".");
      if (resource === "messages") method = "conversations.history";
      if (resource === "channels") method = "conversations.list";
      
      const params = new URLSearchParams(plan.params as Record<string, string>);

      const res = await fetch(`https://slack.com/api/${method}?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      
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
