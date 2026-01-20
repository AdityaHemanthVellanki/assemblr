import { CompiledToolArtifact } from "@/lib/toolos/compiler";
import { ActionGraph, ActionNode, ConditionalEdge } from "@/lib/toolos/spec";
import { executeToolAction } from "@/lib/toolos/runtime";
import { loadToolState, saveToolState } from "@/lib/toolos/state-store";
import { createExecutionRun, updateExecutionRun } from "@/lib/toolos/execution-runs";
import { loadMemory, MemoryScope } from "@/lib/toolos/memory-store";

export async function runActionGraph(params: {
  orgId: string;
  toolId: string;
  compiledTool: CompiledToolArtifact;
  graph: ActionGraph;
  input: Record<string, any>;
  triggerId?: string | null;
  dryRun?: boolean;
}) {
  const { orgId, toolId, compiledTool, graph, input, triggerId, dryRun = false } = params;
  
  const scope: MemoryScope = { type: "tool_org", toolId, orgId };
  const initialState = await loadToolState(toolId, orgId);
  const run = await createExecutionRun({
    orgId,
    toolId,
    triggerId: triggerId ?? null,
    workflowId: "action-graph", // Using fixed ID for now
    input,
    stateSnapshot: initialState,
  });

  const runLogs: Array<Record<string, any>> = [];
  await updateExecutionRun({ runId: run.id, status: "running", currentStep: "start" });

  const nodeResults: Record<string, any> = {};
  const visited = new Set<string>();
  const nodesMap = new Map(graph.nodes.map(n => [n.id, n]));
  
  // Find start nodes (nodes with no incoming edges)
  const incomingEdges = new Set(graph.edges.map(e => e.to));
  const startNodes = graph.nodes.filter(n => !incomingEdges.has(n.id));

  const queue = [...startNodes];
  
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (visited.has(node.id)) continue;
    visited.add(node.id);

    await updateExecutionRun({ runId: run.id, currentStep: node.id });

    // Execute Action
    let output: any = null;
    let error: any = null;
    const startTime = Date.now();

    try {
      // Merge inputs from previous steps if available
      const nodeInput = { ...input, ...nodeResults };
      
      const result = await executeToolAction({
        orgId,
        toolId,
        compiledTool,
        actionId: node.actionId,
        input: nodeInput,
        recordRun: false, // We record the graph run, not individual actions
        dryRun,
      });
      
      output = result.output;
      nodeResults[node.id] = output;
      
      // Update State if needed
      if (result.state && !dryRun) {
          await saveToolState(toolId, orgId, result.state);
      }

      runLogs.push({
        id: `${node.id}:done`,
        timestamp: new Date().toISOString(),
        status: "done",
        actionId: node.actionId,
        durationMs: Date.now() - startTime,
        output: output
      });

    } catch (e) {
      error = e;
      runLogs.push({
        id: `${node.id}:failed`,
        timestamp: new Date().toISOString(),
        status: "failed",
        actionId: node.actionId,
        durationMs: Date.now() - startTime,
        error: e instanceof Error ? e.message : String(e)
      });
    }

    await updateExecutionRun({ runId: run.id, logs: runLogs });

    // Determine next nodes
    const outgoingEdges = graph.edges.filter(e => e.from === node.id);
    
    for (const edge of outgoingEdges) {
      let shouldTake = false;
      
      if (edge.type === "success" && !error) shouldTake = true;
      else if (edge.type === "failure" && error) shouldTake = true;
      else if (edge.type === "default") shouldTake = true;
      
      if (shouldTake && edge.condition) {
          // Evaluate condition against state/output
          // Simple evaluation for now
          shouldTake = evaluateCondition(edge.condition, { output, error, state: await loadToolState(toolId, orgId) });
      }

      if (shouldTake) {
        const nextNode = nodesMap.get(edge.to);
        if (nextNode) queue.push(nextNode);
      }
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

function evaluateCondition(condition: string, context: any): boolean {
    // Basic safety check - in production use a safer evaluator
    try {
        // Support simple state path checks
        if (condition.includes(".")) {
            const val = condition.split(".").reduce((acc, part) => acc && acc[part], context);
            return !!val;
        }
        return !!context[condition];
    } catch {
        return false;
    }
}
