import { CompiledIntent, ExecutionNode } from "../core/intent";

type SandboxLog = {
  type: "node_start" | "node_complete" | "node_skip" | "error";
  nodeId?: string;
  message: string;
};

export type SandboxResult =
  | {
      ok: true;
      logs: SandboxLog[];
    }
  | {
      ok: false;
      error: {
        type: "InvalidIntentGraph";
        reason:
          | "UnreachableNode"
          | "DanglingEdge"
          | "CycleDetected"
          | "InvalidActionType"
          | "MissingCapability"
          | "SandboxExecutionFailed";
        nodeId?: string;
        details?: string;
        autoFix?: string;
        status?: "rewritten" | "rejected";
      };
      logs: SandboxLog[];
    };

export function runIntentInSandbox(intent: CompiledIntent): SandboxResult {
  const logs: SandboxLog[] = [];

  const graph = intent.execution_graph;
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    console.error("[GraphDebugDump] Missing execution_graph", {
      intent_type: intent.intent_type,
      output_mode: intent.output_mode,
    });
    return {
      ok: false,
      error: {
        type: "InvalidIntentGraph",
        reason: "SandboxExecutionFailed",
        details: "Missing execution_graph",
        status: "rejected",
      },
      logs,
    };
  }

  const nodeById = new Map<string, ExecutionNode>();
  for (const n of graph.nodes) {
    nodeById.set(n.id, n);
  }

  for (const e of graph.edges) {
    if (!nodeById.has(e.from) || !nodeById.has(e.to)) {
      console.error("[GraphDebugDump] Dangling edge detected", {
        from: e.from,
        to: e.to,
      });
      return {
        ok: false,
        error: {
          type: "InvalidIntentGraph",
          reason: "DanglingEdge",
          details: `Edge from ${e.from} to ${e.to} references unknown node`,
          status: "rejected",
        },
        logs,
      };
    }
  }

  const indegree = new Map<string, number>();
  for (const n of graph.nodes) indegree.set(n.id, 0);
  for (const e of graph.edges) indegree.set(e.to, (indegree.get(e.to) || 0) + 1);

  const queue: string[] = [];
  for (const [id, deg] of indegree.entries()) {
    if (deg === 0) queue.push(id);
  }
  const roots = queue.slice();

  const topo: string[] = [];
  while (queue.length) {
    const id = queue.shift() as string;
    topo.push(id);
    for (const e of graph.edges) {
      if (e.from === id) {
        const next = e.to;
        indegree.set(next, (indegree.get(next) || 0) - 1);
        if (indegree.get(next) === 0) queue.push(next);
      }
    }
  }

  if (topo.length !== graph.nodes.length) {
    console.error("[GraphDebugDump] Cycle detected in execution graph", {
      nodes: graph.nodes.map((n) => n.id),
      edges: graph.edges,
    });
    return {
      ok: false,
      error: {
        type: "InvalidIntentGraph",
        reason: "CycleDetected",
        details: "Execution graph contains a cycle",
        status: "rejected",
      },
      logs,
    };
  }

  const allowedNodeTypes = new Set<ExecutionNode["type"]>([
    "integration_call",
    "transform",
    "condition",
    "emit_event",
  ]);

  const neighbors = new Map<string, string[]>();
  for (const n of graph.nodes) {
    neighbors.set(n.id, []);
  }
  for (const e of graph.edges) {
    neighbors.get(e.from)!.push(e.to);
    neighbors.get(e.to)!.push(e.from);
  }

  if (roots.length > 0) {
    for (const rootId of roots) {
      const node = nodeById.get(rootId);
      if (!node) continue;
      const kind = (node.params as any)?.entry_kind;
      if (!kind || (kind !== "lifecycle" && kind !== "ui" && kind !== "synthetic")) {
        console.error("[GraphDebugDump] Invalid root node", {
          rootId,
          type: node.type,
          params: node.params,
        });
        return {
          ok: false,
          error: {
            type: "InvalidIntentGraph",
            reason: "UnreachableNode",
            nodeId: rootId,
            details: `Root node '${rootId}' is not bound to a lifecycle or UI trigger`,
            status: "rejected",
          },
          logs,
        };
      }
    }
  }

  for (const nodeId of topo) {
    const node = nodeById.get(nodeId)!;

    if (!allowedNodeTypes.has(node.type)) {
      console.error("[GraphDebugDump] Invalid node type", {
        nodeId,
        type: node.type,
      });
      return {
        ok: false,
        error: {
          type: "InvalidIntentGraph",
          reason: "InvalidActionType",
          nodeId,
          details: `Unsupported node type '${node.type}'`,
          status: "rejected",
        },
        logs,
      };
    }

    if (node.type === "integration_call") {
      if (!node.capabilityId) {
        console.error("[GraphDebugDump] integration_call node missing capabilityId", {
          nodeId,
        });
        return {
          ok: false,
          error: {
            type: "InvalidIntentGraph",
            reason: "MissingCapability",
            nodeId,
            details: "integration_call node missing capabilityId",
            status: "rejected",
          },
          logs,
        };
      }
    }

    logs.push({ type: "node_start", nodeId, message: `Simulating node ${nodeId} (${node.type})` });

    try {
      switch (node.type) {
        case "integration_call": {
          logs.push({
            type: "node_complete",
            nodeId,
            message: "integration_call simulated (no side effects)",
          });
          break;
        }
        case "transform": {
          logs.push({ type: "node_complete", nodeId, message: "transform simulated" });
          break;
        }
        case "condition": {
          logs.push({ type: "node_complete", nodeId, message: "condition evaluated deterministically" });
          break;
        }
        case "emit_event": {
          logs.push({ type: "node_complete", nodeId, message: "event emission simulated" });
          break;
        }
      }
    } catch (e) {
      return {
        ok: false,
        error: {
          type: "InvalidIntentGraph",
          reason: "SandboxExecutionFailed",
          nodeId,
          details: e instanceof Error ? e.message : String(e),
          status: "rejected",
        },
        logs,
      };
    }
  }

  const contract = intent.ui_contract;
  if (contract && Array.isArray(contract.views) && contract.views.length) {
    const referenced = new Set<string>();
    for (const v of contract.views) {
      if (!v.data_source_node_id) continue;
      if (!nodeById.has(v.data_source_node_id)) {
        console.error("[GraphDebugDump] UI view references missing node", {
          viewTitle: v.title,
          nodeId: v.data_source_node_id,
        });
        return {
          ok: false,
          error: {
            type: "InvalidIntentGraph",
            reason: "UnreachableNode",
            nodeId: v.data_source_node_id,
            details: `UI view '${v.title}' references missing node '${v.data_source_node_id}'`,
            status: "rejected",
          },
          logs,
        };
      }
      referenced.add(v.data_source_node_id);
    }

    if (referenced.size > 0) {
      const visited = new Set<string>(referenced);
      const queue = Array.from(referenced);
      while (queue.length) {
        const current = queue.shift() as string;
        const next = neighbors.get(current) ?? [];
        for (const n of next) {
          if (!visited.has(n)) {
            visited.add(n);
            queue.push(n);
          }
        }
      }

      for (const id of nodeById.keys()) {
        if (!visited.has(id)) {
          console.error("[GraphDebugDump] Node not connected to any UI view", {
            nodeId: id,
          });
          return {
            ok: false,
            error: {
              type: "InvalidIntentGraph",
              reason: "UnreachableNode",
              nodeId: id,
              details: `Node '${id}' is not connected to any UI view`,
              autoFix: "Remove node or connect it to a UI view",
              status: "rejected",
            },
            logs,
          };
        }
      }
    }
  }

  return { ok: true, logs };
}
