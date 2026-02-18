import { CompiledToolArtifact } from "@/lib/toolos/compiler";
import { WorkflowSpec, WorkflowNode } from "@/lib/toolos/spec";
import { executeToolAction } from "@/lib/toolos/runtime";
import { loadToolState } from "@/lib/toolos/state-store";
import { createExecutionRun, updateExecutionRun } from "@/lib/toolos/execution-runs";
import { loadMemory, MemoryScope } from "@/lib/toolos/memory-store";
import {
  createWorkflowStep,
  updateWorkflowStep,
  getStepsForRun,
  getIncompleteSteps,
  WorkflowStepStatus,
} from "@/lib/toolos/workflow-steps";
import { recordMetric } from "@/lib/observability/metrics";
import { Semaphore } from "@/lib/core/semaphore";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function runWorkflow(params: {
  orgId: string;
  toolId: string;
  compiledTool: CompiledToolArtifact;
  workflowId: string;
  input: Record<string, any>;
  triggerId?: string | null;
}) {
  const { orgId, toolId, compiledTool, workflowId, input, triggerId } = params;
  const workflow = compiledTool.workflows.find((w) => w.id === workflowId);
  if (!workflow) {
    throw new Error(`Workflow ${workflowId} not found`);
  }
  const scope: MemoryScope = { type: "tool_org", toolId, orgId };
  const levels = topologicalLevels(workflow);
  const allNodes = levels.flat();
  const nodeResults: Record<string, any> = {};
  const actionMap = new Map(compiledTool.actions.map((action) => [action.id, action]));
  const paused = await loadMemory({
    scope,
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
  const workflowStartedAt = Date.now();
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

  // Create step rows for every node upfront (all "pending")
  const stepMap = new Map<string, string>(); // nodeId -> stepId
  for (const node of allNodes) {
    const step = await createWorkflowStep({
      runId: run.id,
      nodeId: node.id,
      actionId: node.actionId ?? null,
      status: "pending",
      input: { ...input, ...(nodeResults[node.id] ?? {}) },
    });
    stepMap.set(node.id, step.id);
  }

  // Workflow-level timeout via AbortController
  const timeoutMs = workflow.timeoutMs ?? 0;
  const abortController = timeoutMs > 0 ? new AbortController() : null;
  const timeoutHandle =
    abortController && timeoutMs > 0
      ? setTimeout(() => abortController.abort(), timeoutMs)
      : null;

  // Concurrency limiter for parallel execution within each level
  const sem = new Semaphore(workflow.maxConcurrency ?? 5);
  let workflowBlocked = false;

  try {
    for (const level of levels) {
      if (workflowBlocked) break;

      // Execute all nodes in this level in parallel (respecting concurrency limit)
      const results = await Promise.allSettled(
        level.map(async (node) => {
          await sem.acquire();
          try {
            return await executeNodeInWorkflow({
              node,
              stepMap,
              runId: run.id,
              workflow,
              compiledTool,
              orgId,
              toolId,
              input,
              nodeResults,
              actionMap,
              runLogs,
              abortController,
            });
          } finally {
            sem.release();
          }
        }),
      );

      // Check for failures or blocks after each level
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === "rejected") {
          // A node threw — mark workflow as failed
          const err = result.reason instanceof Error ? result.reason : new Error(String(result.reason));
          runLogs.push({
            id: `${level[i].id}:level_error`,
            timestamp: new Date().toISOString(),
            status: "failed",
            error: err.message,
          });
          await updateExecutionRun({
            runId: run.id,
            status: "failed",
            currentStep: level[i].id,
            logs: runLogs,
          });
          recordMetric({ orgId, toolId, metricName: "workflow.failed", metricValue: 1, dimensions: { workflowId, error: err.message } });
          return nodeResults;
        }
        if (result.value === "blocked") {
          workflowBlocked = true;
        }
      }
    }
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }

  const workflowDurationMs = Date.now() - workflowStartedAt;

  // Check if any steps failed — if workflow was aborted, mark as failed
  if (abortController?.signal.aborted) {
    await updateExecutionRun({
      runId: run.id,
      status: "failed",
      currentStep: "timeout",
      logs: [
        ...runLogs,
        {
          id: "workflow:timeout",
          timestamp: new Date().toISOString(),
          status: "failed",
          error: `Workflow timed out after ${timeoutMs}ms`,
        },
      ],
    });
    recordMetric({ orgId, toolId, metricName: "workflow.failed", metricValue: 1, dimensions: { workflowId, error: "timeout" } });
    recordMetric({ orgId, toolId, metricName: "workflow.duration_ms", metricValue: workflowDurationMs, dimensions: { workflowId } });
    return nodeResults;
  }

  if (workflowBlocked) {
    recordMetric({ orgId, toolId, metricName: "workflow.blocked", metricValue: 1, dimensions: { workflowId } });
    recordMetric({ orgId, toolId, metricName: "workflow.duration_ms", metricValue: workflowDurationMs, dimensions: { workflowId } });
    return nodeResults;
  }

  const finalState = await loadToolState(toolId, orgId);
  await updateExecutionRun({
    runId: run.id,
    status: "completed",
    currentStep: "completed",
    stateSnapshot: finalState,
    logs: runLogs,
  });
  recordMetric({ orgId, toolId, metricName: "workflow.completed", metricValue: 1, dimensions: { workflowId } });
  recordMetric({ orgId, toolId, metricName: "workflow.duration_ms", metricValue: workflowDurationMs, dimensions: { workflowId } });
  return nodeResults;
}

/**
 * Resume a workflow from its last incomplete step.
 * Loads persisted workflow_steps, skips completed ones, and re-executes from where it left off.
 */
export async function resumeWorkflow(params: {
  runId: string;
  orgId: string;
  toolId: string;
  compiledTool: CompiledToolArtifact;
}) {
  const { runId, orgId, toolId, compiledTool } = params;

  // Load the execution run to get workflowId and input
  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createSupabaseAdminClient();
  const { data: run, error: runError } = await (supabase.from("execution_runs") as any)
    .select("*")
    .eq("id", runId)
    .single();
  if (runError || !run) {
    throw new Error(`Run ${runId} not found`);
  }

  const workflowId = run.workflow_id;
  if (!workflowId) {
    throw new Error(`Run ${runId} has no workflow_id — cannot resume`);
  }

  const workflow = compiledTool.workflows.find((w) => w.id === workflowId);
  if (!workflow) {
    throw new Error(`Workflow ${workflowId} not found in compiled tool`);
  }

  const order = topologicalOrder(workflow);
  const actionMap = new Map(compiledTool.actions.map((a) => [a.id, a]));
  const input = run.input ?? {};

  // Load all persisted steps for this run
  const existingSteps = await getStepsForRun(runId);
  const stepByNode = new Map(existingSteps.map((s) => [s.nodeId, s]));

  // Rebuild nodeResults from completed steps
  const nodeResults: Record<string, any> = {};
  for (const step of existingSteps) {
    if (step.status === "completed" && step.output !== null) {
      nodeResults[step.nodeId] = step.output;
    }
  }

  const runLogs: Array<Record<string, any>> = run.logs ?? [];
  await updateExecutionRun({ runId, status: "running", currentStep: "resuming" });

  // Workflow-level timeout
  const timeoutMs = workflow.timeoutMs ?? 0;
  const abortController = timeoutMs > 0 ? new AbortController() : null;
  const timeoutHandle =
    abortController && timeoutMs > 0
      ? setTimeout(() => abortController.abort(), timeoutMs)
      : null;

  try {
    for (const node of order) {
      const existingStep = stepByNode.get(node.id);

      // Skip completed steps
      if (existingStep?.status === "completed") {
        continue;
      }

      // Skip nodes that were explicitly skipped
      if (existingStep?.status === "skipped") {
        continue;
      }

      // Check timeout
      if (abortController?.signal.aborted) {
        if (existingStep) {
          await updateWorkflowStep(existingStep.id, { status: "skipped" });
        }
        continue;
      }

      // Create step row if it doesn't exist (e.g., run was created before step tracking)
      let stepId = existingStep?.id;
      if (!stepId) {
        const step = await createWorkflowStep({
          runId,
          nodeId: node.id,
          actionId: node.actionId ?? null,
          status: "pending",
          input: { ...input, ...(nodeResults[node.id] ?? {}) },
        });
        stepId = step.id;
      }

      if (node.type === "action") {
        // Reset retries counter from the existing step so resume continues where it left off
        const priorRetries = existingStep?.retries ?? 0;
        await executeNodeWithRetry({
          node,
          stepId,
          runId,
          workflow,
          compiledTool,
          orgId,
          toolId,
          input,
          nodeResults,
          actionMap,
          runLogs,
          abortSignal: abortController?.signal ?? null,
          startRetry: priorRetries,
        });
        continue;
      }

      if (node.type === "condition") {
        await updateWorkflowStep(stepId, {
          status: "running",
          startedAt: new Date().toISOString(),
        });
        const state = await loadToolState(toolId, orgId);
        const path = node.condition ?? "";
        const value = resolveStatePath(state, path);
        if (!value) {
          await updateWorkflowStep(stepId, {
            status: "blocked" as WorkflowStepStatus,
            completedAt: new Date().toISOString(),
          });
          runLogs.push({
            id: `${node.id}:blocked`,
            timestamp: new Date().toISOString(),
            status: "blocked",
            condition: path,
          });
          await updateExecutionRun({
            runId,
            status: "blocked",
            currentStep: node.id,
            logs: runLogs,
          });
          break;
        }
        await updateWorkflowStep(stepId, {
          status: "completed",
          output: { conditionMet: true, path },
          completedAt: new Date().toISOString(),
        });
        continue;
      }

      if (node.type === "wait") {
        const waitMs = Math.max(0, node.waitMs ?? 0);
        await updateWorkflowStep(stepId, {
          status: "running",
          startedAt: new Date().toISOString(),
        });
        if (waitMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
        await updateWorkflowStep(stepId, {
          status: "completed",
          output: { waitMs },
          durationMs: waitMs,
          completedAt: new Date().toISOString(),
        });
        runLogs.push({
          id: `${node.id}:done`,
          timestamp: new Date().toISOString(),
          status: "done",
          waitMs,
        });
        await updateExecutionRun({ runId, currentStep: node.id, logs: runLogs });
        continue;
      }

      if (node.type === "transform") {
        await updateWorkflowStep(stepId, {
          status: "running",
          startedAt: new Date().toISOString(),
        });
        nodeResults[node.id] = nodeResults[node.id] ?? input;
        await updateWorkflowStep(stepId, {
          status: "completed",
          output: { transform: node.transform ?? null },
          completedAt: new Date().toISOString(),
        });
        runLogs.push({
          id: `${node.id}:done`,
          timestamp: new Date().toISOString(),
          status: "done",
          transform: node.transform ?? null,
        });
        await updateExecutionRun({ runId, currentStep: node.id, logs: runLogs });
        continue;
      }
    }
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }

  if (abortController?.signal.aborted) {
    await updateExecutionRun({
      runId,
      status: "failed",
      currentStep: "timeout",
      logs: [
        ...runLogs,
        {
          id: "workflow:timeout",
          timestamp: new Date().toISOString(),
          status: "failed",
          error: `Workflow timed out after ${timeoutMs}ms`,
        },
      ],
    });
    return nodeResults;
  }

  const finalState = await loadToolState(toolId, orgId);
  await updateExecutionRun({
    runId,
    status: "completed",
    currentStep: "completed",
    stateSnapshot: finalState,
    logs: runLogs,
  });
  return nodeResults;
}

// ---------------------------------------------------------------------------
// Per-node dispatch (used by parallel level execution)
// ---------------------------------------------------------------------------

async function executeNodeInWorkflow(params: {
  node: WorkflowNode;
  stepMap: Map<string, string>;
  runId: string;
  workflow: WorkflowSpec;
  compiledTool: CompiledToolArtifact;
  orgId: string;
  toolId: string;
  input: Record<string, any>;
  nodeResults: Record<string, any>;
  actionMap: Map<string, any>;
  runLogs: Array<Record<string, any>>;
  abortController: AbortController | null;
}): Promise<"ok" | "blocked"> {
  const {
    node,
    stepMap,
    runId,
    workflow,
    compiledTool,
    orgId,
    toolId,
    input,
    nodeResults,
    actionMap,
    runLogs,
    abortController,
  } = params;

  // Check workflow-level timeout
  if (abortController?.signal.aborted) {
    const stepId = stepMap.get(node.id);
    if (stepId) {
      await updateWorkflowStep(stepId, { status: "skipped" });
    }
    runLogs.push({
      id: `${node.id}:timeout`,
      timestamp: new Date().toISOString(),
      status: "skipped",
      reason: "workflow timeout exceeded",
    });
    return "ok";
  }

  const stepId = stepMap.get(node.id)!;

  if (node.type === "action") {
    await executeNodeWithRetry({
      node,
      stepId,
      runId,
      workflow,
      compiledTool,
      orgId,
      toolId,
      input,
      nodeResults,
      actionMap,
      runLogs,
      abortSignal: abortController?.signal ?? null,
    });
    return "ok";
  }

  if (node.type === "condition") {
    await updateWorkflowStep(stepId, {
      status: "running",
      startedAt: new Date().toISOString(),
    });
    const state = await loadToolState(toolId, orgId);
    const path = node.condition ?? "";
    const value = resolveStatePath(state, path);
    if (!value) {
      await updateWorkflowStep(stepId, {
        status: "blocked" as WorkflowStepStatus,
        completedAt: new Date().toISOString(),
      });
      runLogs.push({
        id: `${node.id}:blocked`,
        timestamp: new Date().toISOString(),
        status: "blocked",
        condition: path,
      });
      await updateExecutionRun({
        runId,
        status: "blocked",
        currentStep: node.id,
        logs: runLogs,
      });
      return "blocked";
    }
    await updateWorkflowStep(stepId, {
      status: "completed",
      output: { conditionMet: true, path },
      completedAt: new Date().toISOString(),
    });
    return "ok";
  }

  if (node.type === "wait") {
    const waitMs = Math.max(0, node.waitMs ?? 0);
    await updateWorkflowStep(stepId, {
      status: "running",
      startedAt: new Date().toISOString(),
    });
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    await updateWorkflowStep(stepId, {
      status: "completed",
      output: { waitMs },
      durationMs: waitMs,
      completedAt: new Date().toISOString(),
    });
    runLogs.push({
      id: `${node.id}:done`,
      timestamp: new Date().toISOString(),
      status: "done",
      waitMs,
    });
    await updateExecutionRun({ runId, currentStep: node.id, logs: runLogs });
    return "ok";
  }

  if (node.type === "transform") {
    await updateWorkflowStep(stepId, {
      status: "running",
      startedAt: new Date().toISOString(),
    });
    nodeResults[node.id] = nodeResults[node.id] ?? input;
    await updateWorkflowStep(stepId, {
      status: "completed",
      output: { transform: node.transform ?? null },
      completedAt: new Date().toISOString(),
    });
    runLogs.push({
      id: `${node.id}:done`,
      timestamp: new Date().toISOString(),
      status: "done",
      transform: node.transform ?? null,
    });
    await updateExecutionRun({ runId, currentStep: node.id, logs: runLogs });
    return "ok";
  }

  return "ok";
}

// ---------------------------------------------------------------------------
// Retry logic
// ---------------------------------------------------------------------------

async function executeNodeWithRetry(params: {
  node: WorkflowNode;
  stepId: string;
  runId: string;
  workflow: WorkflowSpec;
  compiledTool: CompiledToolArtifact;
  orgId: string;
  toolId: string;
  input: Record<string, any>;
  nodeResults: Record<string, any>;
  actionMap: Map<string, any>;
  runLogs: Array<Record<string, any>>;
  abortSignal: AbortSignal | null;
  startRetry?: number;
}) {
  const {
    node,
    stepId,
    runId,
    workflow,
    compiledTool,
    orgId,
    toolId,
    input,
    nodeResults,
    actionMap,
    runLogs,
    abortSignal,
    startRetry = 0,
  } = params;

  if (!node.actionId) throw new Error(`Workflow node ${node.id} missing actionId`);

  const maxRetries = workflow.retryPolicy?.maxRetries ?? 0;
  const backoffMs = workflow.retryPolicy?.backoffMs ?? 1000;
  const actionSpec = actionMap.get(node.actionId);
  const inputPayload = { ...input, ...(nodeResults[node.id] ?? {}) };

  await updateWorkflowStep(stepId, {
    status: "running",
    startedAt: new Date().toISOString(),
    retries: startRetry,
  });
  await updateExecutionRun({ runId, currentStep: node.id });

  let lastError: Error | null = null;

  for (let attempt = startRetry; attempt <= maxRetries; attempt++) {
    // Check abort before each attempt
    if (abortSignal?.aborted) {
      await updateWorkflowStep(stepId, { status: "skipped" });
      return;
    }

    // Exponential backoff between retries (not before first attempt)
    if (attempt > startRetry) {
      const delay = backoffMs * Math.pow(2, attempt - 1);
      await updateWorkflowStep(stepId, { retries: attempt });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    const startedAt = Date.now();
    try {
      const result = await executeToolAction({
        orgId,
        toolId,
        compiledTool,
        actionId: node.actionId,
        input: inputPayload,
        recordRun: false,
      });

      // Success
      nodeResults[node.id] = result.output;
      const durationMs = Date.now() - startedAt;

      await updateWorkflowStep(stepId, {
        status: "completed",
        output: result.output,
        retries: attempt,
        durationMs,
        completedAt: new Date().toISOString(),
      });

      runLogs.push({
        id: `${node.id}:done`,
        timestamp: new Date().toISOString(),
        status: "done",
        actionId: node.actionId,
        integrationId: actionSpec?.integrationId,
        capabilityId: actionSpec?.capabilityId,
        durationMs,
        retries: attempt,
        input: sanitizeLogData(inputPayload),
        output: summarizeOutput(result.output),
      });
      await updateExecutionRun({ runId, logs: runLogs });
      recordMetric({ orgId, toolId, metricName: "action.completed", metricValue: 1, dimensions: { actionId: node.actionId, nodeId: node.id } });
      recordMetric({ orgId, toolId, metricName: "action.duration_ms", metricValue: durationMs, dimensions: { actionId: node.actionId, nodeId: node.id } });
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const durationMs = Date.now() - startedAt;

      // Log each retry attempt
      if (attempt < maxRetries) {
        runLogs.push({
          id: `${node.id}:retry:${attempt}`,
          timestamp: new Date().toISOString(),
          status: "retrying",
          actionId: node.actionId,
          attempt,
          maxRetries,
          durationMs,
          error: lastError.message,
        });
        await updateExecutionRun({ runId, logs: runLogs });
      }
    }
  }

  // All retries exhausted — mark step and run as failed
  await updateWorkflowStep(stepId, {
    status: "failed",
    error: lastError?.message ?? "unknown error",
    retries: maxRetries,
    completedAt: new Date().toISOString(),
  });

  runLogs.push({
    id: `${node.id}:failed`,
    timestamp: new Date().toISOString(),
    status: "failed",
    actionId: node.actionId,
    integrationId: actionSpec?.integrationId,
    capabilityId: actionSpec?.capabilityId,
    retries: maxRetries,
    input: sanitizeLogData(inputPayload),
    error: lastError?.message ?? "error",
  });
  await updateExecutionRun({
    runId,
    status: "failed",
    currentStep: node.id,
    logs: runLogs,
  });
  recordMetric({ orgId, toolId, metricName: "action.failed", metricValue: 1, dimensions: { actionId: node.actionId, nodeId: node.id, error: lastError?.message } });
  throw lastError ?? new Error(`Node ${node.id} failed after ${maxRetries} retries`);
}

// ---------------------------------------------------------------------------
// Graph helpers
// ---------------------------------------------------------------------------

function topologicalOrder(workflow: WorkflowSpec): WorkflowNode[] {
  return topologicalLevels(workflow).flat();
}

/**
 * Group workflow nodes into topological levels.
 * Nodes within the same level have no dependencies on each other
 * and can be executed in parallel.
 */
function topologicalLevels(workflow: WorkflowSpec): WorkflowNode[][] {
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

  const levels: WorkflowNode[][] = [];
  let queue = Array.from(indegree.entries())
    .filter(([, deg]) => deg === 0)
    .map(([id]) => id);
  let processed = 0;

  while (queue.length > 0) {
    const level: WorkflowNode[] = [];
    const nextQueue: string[] = [];
    for (const id of queue) {
      const node = nodes.get(id);
      if (node) {
        level.push(node);
        processed++;
      }
      for (const to of adj.get(id) ?? []) {
        indegree.set(to, (indegree.get(to) ?? 0) - 1);
        if ((indegree.get(to) ?? 0) === 0) nextQueue.push(to);
      }
    }
    if (level.length > 0) levels.push(level);
    queue = nextQueue;
  }

  if (processed !== nodes.size) {
    throw new Error(`Workflow ${workflow.id} has cycles`);
  }
  return levels;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

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

function sanitizeLogData(value: any, depth = 0): any {
  if (depth > 3) return "[truncated]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value.length > 500 ? value.slice(0, 500) : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 10).map((item) => sanitizeLogData(item, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
      if (shouldRedactKey(key)) {
        out[key] = "[redacted]";
        continue;
      }
      out[key] = sanitizeLogData(val, depth + 1);
    }
    return out;
  }
  return String(value);
}

function shouldRedactKey(key: string) {
  const lower = key.toLowerCase();
  return (
    lower.includes("token") ||
    lower.includes("secret") ||
    lower.includes("password") ||
    lower.includes("authorization") ||
    lower.includes("api_key")
  );
}

function summarizeOutput(output: any) {
  if (Array.isArray(output)) {
    const sample = output.slice(0, 3).map((item) => sanitizeLogData(item));
    return { type: "array", count: output.length, sample };
  }
  if (typeof output === "object" && output !== null) {
    const keys = Object.keys(output);
    return { type: "object", keys, sample: sanitizeLogData(output) };
  }
  return sanitizeLogData(output);
}
