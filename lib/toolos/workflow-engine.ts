import { ToolSystemSpec, WorkflowSpec, WorkflowNode } from "@/lib/toolos/spec";
import { executeToolAction } from "@/lib/toolos/runtime";
import { loadToolState } from "@/lib/toolos/state-store";

export async function runWorkflow(params: {
  orgId: string;
  toolId: string;
  spec: ToolSystemSpec;
  workflowId: string;
  input: Record<string, any>;
}) {
  const { orgId, toolId, spec, workflowId, input } = params;
  const workflow = spec.workflows.find((w) => w.id === workflowId);
  if (!workflow) {
    throw new Error(`Workflow ${workflowId} not found`);
  }
  const order = topologicalOrder(workflow);
  const nodeResults: Record<string, any> = {};

  for (const node of order) {
    if (node.type === "action") {
      if (!node.actionId) throw new Error(`Workflow node ${node.id} missing actionId`);
      const result = await executeToolAction({
        orgId,
        toolId,
        spec,
        actionId: node.actionId,
        input: { ...input, ...(nodeResults[node.id] ?? {}) },
      });
      nodeResults[node.id] = result.output;
      continue;
    }
    if (node.type === "condition") {
      const state = await loadToolState(toolId, orgId);
      const path = node.condition ?? "";
      const value = resolveStatePath(state, path);
      if (!value) {
        break;
      }
      continue;
    }
    if (node.type === "wait") {
      const waitMs = Math.max(0, node.waitMs ?? 0);
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      continue;
    }
    if (node.type === "transform") {
      nodeResults[node.id] = nodeResults[node.id] ?? input;
      continue;
    }
  }

  return nodeResults;
}

function topologicalOrder(workflow: WorkflowSpec): WorkflowNode[] {
  const nodes = new Map(workflow.nodes.map((n) => [n.id, n]));
  const indegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const node of workflow.nodes) {
    indegree.set(node.id, 0);
    adj.set(node.id, []);
  }
  for (const edge of workflow.edges) {
    if (!nodes.has(edge.from) || !nodes.has(edge.to)) {
      throw new Error(`Workflow edge references missing node ${edge.from} -> ${edge.to}`);
    }
    adj.get(edge.from)!.push(edge.to);
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  }

  const queue = Array.from(indegree.entries())
    .filter(([, deg]) => deg === 0)
    .map(([id]) => id);
  const result: WorkflowNode[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = nodes.get(id);
    if (node) result.push(node);
    for (const to of adj.get(id) ?? []) {
      indegree.set(to, (indegree.get(to) ?? 0) - 1);
      if ((indegree.get(to) ?? 0) === 0) queue.push(to);
    }
  }
  if (result.length !== nodes.size) {
    throw new Error(`Workflow ${workflow.id} has cycles`);
  }
  return result;
}

function resolveStatePath(state: Record<string, any>, path: string) {
  if (!path) return null;
  const parts = path.split(".");
  let current: any = state;
  for (const part of parts) {
    if (current == null) return null;
    current = current[part];
  }
  return current ?? null;
}
