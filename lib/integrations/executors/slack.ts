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
        throw new Error(`Unsupported Slack resource: ${plan.resource}`);
      }

      return {
        viewId: plan.viewId,
        status: "success",
        data,
        timestamp: new Date().toISOString(),
        source: "slack",
      };
    } catch (err) {
      return {
        viewId: plan.viewId,
        status: "error",
        error: err instanceof Error ? err.message : "Unknown Slack error",
        timestamp: new Date().toISOString(),
        source: "slack",
      };
    }
  }
}
