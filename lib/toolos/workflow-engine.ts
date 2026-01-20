import { ToolSystemSpec, WorkflowSpec, WorkflowNode } from "@/lib/toolos/spec";
import { executeToolAction } from "@/lib/toolos/runtime";
import { loadToolState } from "@/lib/toolos/state-store";
import { createExecutionRun, updateExecutionRun } from "@/lib/toolos/execution-runs";
import { loadToolMemory } from "@/lib/toolos/memory-store";

export async function runWorkflow(params: {
  orgId: string;
  toolId: string;
  spec: ToolSystemSpec;
  workflowId: string;
  input: Record<string, any>;
  triggerId?: string | null;
}) {
  const { orgId, toolId, spec, workflowId, input, triggerId } = params;
  const workflow = spec.workflows.find((w) => w.id === workflowId);
  if (!workflow) {
    throw new Error(`Workflow ${workflowId} not found`);
  }
  const order = topologicalOrder(workflow);
  const nodeResults: Record<string, any> = {};
  const paused = await loadToolMemory({
    toolId,
    orgId,
    namespace: "tool_builder",
    key: "automation_paused",
  });
  const initialState = await loadToolState(toolId, orgId);
  const run = await createExecutionRun({
    orgId,
    toolId,
    triggerId: triggerId ?? null,
    workflowId: workflowId,
    input,
    stateSnapshot: initialState,
  });
  const runLogs: Array<Record<string, any>> = [];
  if (paused === true) {
    runLogs.push({
      timestamp: new Date().toISOString(),
      status: "blocked",
      message: "Paused by user",
    });
    await updateExecutionRun({
      runId: run.id,
      status: "blocked",
      currentStep: "paused",
      logs: runLogs,
    });
    return nodeResults;
  }
  await updateExecutionRun({ runId: run.id, status: "running", currentStep: "start" });

  for (const node of order) {
    if (node.type === "action") {
      if (!node.actionId) throw new Error(`Workflow node ${node.id} missing actionId`);
      await updateExecutionRun({ runId: run.id, currentStep: node.id });
      const retryPolicy = workflow.retryPolicy;
      let attempts = 0;
      while (true) {
        try {
          const result = await executeToolAction({
            orgId,
            toolId,
            spec,
            actionId: node.actionId,
            input: { ...input, ...(nodeResults[node.id] ?? {}) },
            recordRun: false,
          });
          nodeResults[node.id] = result.output;
          runLogs.push({
            timestamp: new Date().toISOString(),
            status: "done",
            message: `Executed ${node.actionId}`,
          });
          await updateExecutionRun({
            runId: run.id,
            logs: runLogs,
          });
          break;
        } catch (err) {
          attempts += 1;
          if (attempts > retryPolicy.maxRetries) {
            runLogs.push({
              timestamp: new Date().toISOString(),
              status: "failed",
              message: `Failed ${node.actionId}: ${err instanceof Error ? err.message : "error"}`,
            });
            await updateExecutionRun({
              runId: run.id,
              status: "failed",
              currentStep: node.id,
              logs: runLogs,
            });
            throw err;
          }
          await new Promise((resolve) => setTimeout(resolve, retryPolicy.backoffMs));
        }
      }
      continue;
    }
    if (node.type === "condition") {
      const state = await loadToolState(toolId, orgId);
      const path = node.condition ?? "";
      const value = resolveStatePath(state, path);
      if (!value) {
        runLogs.push({
          timestamp: new Date().toISOString(),
          status: "blocked",
          message: `Blocked on condition ${path}`,
        });
        await updateExecutionRun({
          runId: run.id,
          status: "blocked",
          currentStep: node.id,
          logs: runLogs,
        });
        break;
      }
      continue;
    }
    if (node.type === "wait") {
      const waitMs = Math.max(0, node.waitMs ?? 0);
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      runLogs.push({
        timestamp: new Date().toISOString(),
        status: "done",
        message: `Waited ${waitMs}ms`,
      });
      await updateExecutionRun({
        runId: run.id,
        currentStep: node.id,
        logs: runLogs,
      });
      continue;
    }
    if (node.type === "transform") {
      nodeResults[node.id] = nodeResults[node.id] ?? input;
      runLogs.push({
        timestamp: new Date().toISOString(),
        status: "done",
        message: `Transformed ${node.id}`,
      });
      await updateExecutionRun({
        runId: run.id,
        currentStep: node.id,
        logs: runLogs,
      });
      continue;
    }
  }

  const finalState = await loadToolState(toolId, orgId);
  await updateExecutionRun({
    runId: run.id,
    status: "completed",
    currentStep: "completed",
    stateSnapshot: finalState,
    logs: runLogs,
  });
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
