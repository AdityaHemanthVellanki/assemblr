import { getAzureOpenAIClient } from "@/lib/ai/azureOpenAI";
import { getServerEnv } from "@/lib/env";
import type { ToolCompilerStageContext, ToolCompilerStageResult } from "@/lib/toolos/compiler/tool-compiler";

export async function runBuildWorkflows(
  ctx: ToolCompilerStageContext,
): Promise<ToolCompilerStageResult> {
  // Build a rich action catalog with type, input/output schemas for DAG planning
  const actionCatalog = (ctx.spec.actions ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    type: a.type,
    integrationId: a.integrationId,
    inputKeys: Object.keys(a.inputSchema ?? {}),
    outputKeys: Object.keys(a.outputSchema ?? {}),
    requiresApproval: a.requiresApproval ?? false,
  }));

  const response = await getAzureOpenAIClient().chat.completions.create({
    model: getServerEnv().AZURE_OPENAI_DEPLOYMENT_NAME!,
    messages: [
      {
        role: "system",
        content: `You are a workflow planner that generates execution DAGs (directed acyclic graphs).

Return JSON: {
  "workflows": [{
    "id": string,
    "name": string,
    "description": string,
    "nodes": [{"id": string, "type": "action"|"condition"|"transform"|"wait", "actionId": string, "condition": string?, "transform": string?, "waitMs": number?}],
    "edges": [{"from": string, "to": string}],
    "retryPolicy": {"maxRetries": number, "backoffMs": number},
    "timeoutMs": number
  }],
  "triggers": [{
    "id": string,
    "name": string,
    "type": "cron"|"webhook"|"integration_event"|"state_condition",
    "condition": object,
    "actionId": string?,
    "workflowId": string?,
    "enabled": boolean
  }]
}

Rules:
1. Create a workflow when the user's request involves multiple actions that depend on each other (read→decide→write patterns)
2. Every action node MUST reference an actionId from the provided action catalog
3. Edges define execution order: {"from": "node1", "to": "node2"} means node1 runs before node2
4. Use condition nodes for branching (condition is a dot-path into state, e.g. "data.items.length")
5. Use transform nodes for reshaping data between actions
6. Use wait nodes for delays (waitMs in milliseconds)
7. Set retryPolicy.maxRetries=2 and backoffMs=1000 as defaults
8. Set timeoutMs based on expected total duration (default 120000 = 2 minutes)
9. If the user says "every hour", "daily", "weekly" etc., create a cron trigger
10. If the user says "when X happens", create an integration_event or state_condition trigger
11. For simple single-action tools with only READ actions, return empty workflows and triggers
12. For multi-step flows (read data → create issue, fetch PRs → post to Slack), create a workflow with proper node ordering`,
      },
      {
        role: "user",
        content: JSON.stringify({
          prompt: ctx.prompt,
          actions: actionCatalog,
        }),
      },
    ],
    temperature: 0,
    max_tokens: 1500,
    response_format: { type: "json_object" },
  });
  await ctx.onUsage?.(response.usage);
  const content = response.choices[0]?.message?.content;
  if (content) {
    console.log("[ToolCompilerLLMOutput]", { stage: "build-workflows", content });
  }
  if (!content) return { specPatch: { workflows: [], triggers: [] } };
  try {
    const json = JSON.parse(content);
    const workflows = Array.isArray(json.workflows) ? json.workflows : [];
    const triggers = Array.isArray(json.triggers) ? json.triggers : [];
    const actionIds = new Set((ctx.spec.actions ?? []).map((action) => action.id));

    // Validate action references in workflows
    const validWorkflows = workflows.filter((workflow: any) => {
      const nodes = Array.isArray(workflow?.nodes) ? workflow.nodes : [];
      for (const node of nodes) {
        if (node?.type === "action" && node.actionId && !actionIds.has(node.actionId)) {
          console.warn(`[build-workflows] Dropping workflow ${workflow.id}: references unknown action ${node.actionId}`);
          return false;
        }
      }
      return true;
    });

    // Validate action references in triggers
    const validTriggers = triggers.filter((trigger: any) => {
      if (trigger?.actionId && !actionIds.has(trigger.actionId)) {
        console.warn(`[build-workflows] Dropping trigger ${trigger.id}: references unknown action ${trigger.actionId}`);
        return false;
      }
      // Validate workflowId if present
      if (trigger?.workflowId) {
        const wfIds = new Set(validWorkflows.map((w: any) => w.id));
        if (!wfIds.has(trigger.workflowId)) {
          console.warn(`[build-workflows] Dropping trigger ${trigger.id}: references unknown workflow ${trigger.workflowId}`);
          return false;
        }
      }
      return true;
    });

    // Build actionGraph edges from workflow structure for the action-graph-engine
    const actionGraphNodes: Array<{ id: string; actionId: string; stepLabel?: string }> = [];
    const actionGraphEdges: Array<{ from: string; to: string; condition?: string; type?: string }> = [];

    for (const workflow of validWorkflows) {
      const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
      const edges = Array.isArray(workflow.edges) ? workflow.edges : [];

      for (const node of nodes) {
        if (node.type === "action" && node.actionId) {
          actionGraphNodes.push({
            id: node.id,
            actionId: node.actionId,
            stepLabel: node.id,
          });
        }
      }

      for (const edge of edges) {
        const fromNode = nodes.find((n: any) => n.id === edge.from);
        const toNode = nodes.find((n: any) => n.id === edge.to);
        if (fromNode?.type === "action" && toNode?.type === "action") {
          actionGraphEdges.push({
            from: edge.from,
            to: edge.to,
            type: "default",
          });
        }
      }
    }

    const specPatch: any = {
      workflows: validWorkflows,
      triggers: validTriggers,
    };

    // Only set actionGraph if we have meaningful edges
    if (actionGraphNodes.length > 0 && actionGraphEdges.length > 0) {
      specPatch.actionGraph = {
        nodes: actionGraphNodes,
        edges: actionGraphEdges,
      };
    }

    return { specPatch };
  } catch (err) {
    console.warn("[build-workflows] Parse error:", err);
    return { specPatch: { workflows: [], triggers: [] } };
  }
}
