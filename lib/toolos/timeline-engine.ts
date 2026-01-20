import { ToolSystemSpec, TimelineEvent } from "@/lib/toolos/spec";
import { loadToolState } from "@/lib/toolos/state-store";
import { listExecutionRuns } from "@/lib/toolos/execution-runs";

export async function aggregateTimeline(
  orgId: string,
  toolId: string,
  spec: ToolSystemSpec
): Promise<TimelineEvent[]> {
  const events: TimelineEvent[] = [];

  // 1. User Actions from Execution Runs
  const runs = await listExecutionRuns({ orgId, toolId });
  for (const run of runs) {
    if (run.status === "completed" || run.status === "failed") {
        events.push({
            timestamp: run.createdAt,
            entity: "Tool",
            sourceIntegration: "google", // Fallback or system
            action: run.actionId || "Workflow Run",
            metadata: {
                runId: run.id,
                status: run.status,
                triggerId: run.triggerId
            }
        });
    }
  }

  // 2. Integration Events from State
  const state = await loadToolState(toolId, orgId);
  
  // GitHub Issues / Events
  if (state.github) {
      if (Array.isArray(state.github.issues)) {
          state.github.issues.forEach((issue: any) => {
              events.push({
                  timestamp: issue.created_at || issue.updated_at || new Date().toISOString(),
                  entity: "Issue",
                  sourceIntegration: "github",
                  action: "Issue Updated",
                  metadata: {
                      title: issue.title,
                      url: issue.html_url,
                      state: issue.state
                  }
              });
          });
      }
      // Commits
      if (Array.isArray(state.github.commits)) {
          state.github.commits.forEach((commit: any) => {
              events.push({
                  timestamp: commit.commit?.author?.date || new Date().toISOString(),
                  entity: "Repo",
                  sourceIntegration: "github",
                  action: "Commit Pushed",
                  metadata: {
                      message: commit.commit?.message,
                      author: commit.commit?.author?.name
                  }
              });
          });
      }
  }

  // Linear Tickets
  if (state.linear) {
      if (Array.isArray(state.linear.issues)) {
          state.linear.issues.forEach((issue: any) => {
              events.push({
                  timestamp: issue.createdAt || issue.updatedAt || new Date().toISOString(),
                  entity: "Ticket",
                  sourceIntegration: "linear",
                  action: "Ticket Updated",
                  metadata: {
                      title: issue.title,
                      status: issue.state?.name
                  }
              });
          });
      }
  }

  // Slack Messages
  if (state.slack) {
      if (Array.isArray(state.slack.messages)) {
          state.slack.messages.forEach((msg: any) => {
              events.push({
                  timestamp: msg.ts ? new Date(parseFloat(msg.ts) * 1000).toISOString() : new Date().toISOString(),
                  entity: "Message",
                  sourceIntegration: "slack",
                  action: "Message Sent",
                  metadata: {
                      text: msg.text,
                      user: msg.user
                  }
              });
          });
      }
  }

  // Sort by timestamp descending
  return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
