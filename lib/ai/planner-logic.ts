import { CompiledIntent } from "../core/intent";
import type { ToolSpec } from "../spec/toolSpec";
import { normalizeActionId } from "../spec/action-id";
import { ActionRegistry } from "../spec/action-registry";
import { ACTION_TYPES, type ActionType } from "../spec/action-types";
import { runIntentInSandbox } from "../execution/sandbox";
import { getCapability } from "../capabilities/registry";

const COMPONENT_EVENT_ALIASES: Record<string, string[]> = {
  list: ["onSelect", "onItemClick", "onRowClick"],
  select: ["onChange"],
  dropdown: ["onChange"],
  button: ["onClick"],
};

const SELECT_ALL_VALUE = "__all__";

function normalizeComponentEventType(componentType: string, eventType: string): string {
  const typeKey = typeof componentType === "string" ? componentType.toLowerCase() : "";
  const aliases = COMPONENT_EVENT_ALIASES[typeKey];
  if (!aliases || !eventType) return eventType;
  const lower = String(eventType).toLowerCase();
  const match = aliases.find((a) => a.toLowerCase() === lower);
  return match ?? eventType;
}

export function flattenMiniAppComponents(mini: any): Array<{ pageId: string; component: any }> {
  const out: Array<{ pageId: string; component: any }> = [];
  for (const p of mini?.pages ?? []) {
    for (const c of p.components ?? []) {
      out.push({ pageId: p.id, component: c });
      const stack: any[] = Array.isArray(c.children) ? [...c.children] : [];
      while (stack.length) {
        const node = stack.shift();
        if (!node) continue;
        if (typeof node === "string") continue; // Skip ID references
        out.push({ pageId: p.id, component: node });
        if (Array.isArray(node.children)) stack.push(...node.children);
      }
    }
  }
  return out;
}

export function analyzeActionReachability(mutation: any, currentSpec?: ToolSpec): Set<string> {
  const triggered = new Set<string>();
  const stateListeners = new Map<string, Set<string>>(); // stateKey -> Set<actionId>
  
  // Helper: Index action mutations and listeners
  const allActions = (mutation.actionsAdded ?? []);
  
  // 1. Identify Roots (UI Events, Lifecycle, Explicit State Change)
  const addFromNode = (node: any) => {
    if (Array.isArray(node?.events)) {
      for (const e of node.events) {
        if (e?.actionId) {
            triggered.add(normalizeActionId(e.actionId));
        }
      }
    }
  };

  // 2. Index Listeners & Explicit Triggers
  for (const a of allActions) {
      const id = normalizeActionId(a.id);
      if (a.triggeredBy) {
          const triggers = Array.isArray(a.triggeredBy) ? a.triggeredBy : [a.triggeredBy];
          if (triggers.length > 0) {
              triggered.add(id); // Accept explicit triggers as valid roots
              for (const t of triggers) {
                  if (t.type === "state_change" && t.stateKey) {
                      const k = t.stateKey;
                      if (!stateListeners.has(k)) stateListeners.set(k, new Set());
                      stateListeners.get(k)!.add(id);
                  }
              }
          }
      }
  }

  // 3. Scan UI for roots
  for (const c of (mutation.componentsAdded ?? [])) addFromNode(c);
  for (const p of (mutation.pagesAdded ?? [])) addFromNode(p);
  for (const u of (mutation.componentsUpdated ?? [])) addFromNode(u.patch);
  for (const u of (mutation.pagesUpdated ?? [])) addFromNode(u.patch);
  
  if (currentSpec && (currentSpec as any).kind === "mini_app") {
    const mini: any = currentSpec as any;
    for (const p of mini.pages ?? []) {
      addFromNode(p);
      for (const c of p.components ?? []) {
        const stack: any[] = [c];
        while (stack.length) {
          const n = stack.shift();
          if (!n) continue;
          addFromNode(n);
          if (Array.isArray(n.children)) stack.push(...n.children);
        }
      }
    }
  }

  // 4. Causal Graph Traversal (BFS)
  // Expand reachability: Action A (reachable) -> Mutates S -> Action B (triggered by S) -> Action B is reachable
  const queue = Array.from(triggered);
  const visited = new Set(queue);

  while (queue.length > 0) {
      const currentId = queue.shift()!;
      const action = allActions.find((a: any) => normalizeActionId(a.id) === currentId);
      if (!action) continue; // Existing actions not in mutation payload are not traversed for mutation logic here (simplification)

      const mutatedKeys = getMutatedKeys(action);
      for (const key of mutatedKeys) {
          const listeners = stateListeners.get(key);
          if (listeners) {
              for (const listenerId of listeners) {
                  if (!visited.has(listenerId)) {
                      visited.add(listenerId);
                      triggered.add(listenerId);
                      queue.push(listenerId);
                  }
              }
          }
      }
  }

  return triggered;
}

export function getMutatedKeys(action: any): string[] {
    const keys: string[] = [];
    if (action.type === "state_mutation" || action.type === "internal") {
        const updates = action.config?.updates ?? action.config?.set ?? action.config?.assign;
        if (updates && typeof updates === "object") {
           keys.push(...Object.keys(updates));
        } else if (typeof action.config?.assign === "string") {
           keys.push(action.config.assign);
        }
        if (Array.isArray(action.steps)) {
            for (const step of action.steps) {
                if (step.type === "state_mutation") {
                    const u = step.config?.updates ?? step.config?.set;
                    if (u) keys.push(...Object.keys(u));
                }
            }
        }
    }
    if (action.type === "integration_call") {
        const assignKey = action.config?.assign;
        if (typeof assignKey === "string" && assignKey.length > 0) {
            keys.push(assignKey);
            keys.push(`${assignKey}Status`);
            keys.push(`${assignKey}Error`);
        } else if (action.id) {
            const id = String(action.id);
            keys.push(`${id}.data`);
            keys.push(`${id}.status`);
            keys.push(`${id}.error`);
        }
    }
    return keys;
}

export function validateActionGraph(intent: CompiledIntent, currentSpec?: ToolSpec) {
  const mutation = intent.tool_mutation;
  if (!mutation) return;

  const actions = mutation.actionsAdded ?? [];
  const components = mutation.componentsAdded ?? [];
  const pages = mutation.pagesAdded ?? [];

  // 1. Build Graph Nodes
  const nodes = new Map<string, { id: string; type: string; triggers: any[]; dependencies: string[] }>();
  
  for (const a of actions) {
    const id = normalizeActionId(a.id);
    nodes.set(id, {
      id,
      type: a.type,
      triggers: Array.isArray(a.triggeredBy) ? a.triggeredBy : (a.triggeredBy ? [a.triggeredBy] : []),
      dependencies: extractStateDependencies(a)
    });
  }

  // 2. Enforce Invariants & Auto-Heal
  let madeChanges = false;
  
  // 2.1 Reachability & Triggers
  const reachable = new Set<string>();
  const queue: string[] = [];

  // Find Roots
  // A. Lifecycle Events
  if (mutation.pagesAdded) {
      for (const p of mutation.pagesAdded) {
          if (p.events) {
              for (const e of p.events) {
                  if (e.actionId) {
                      const aid = normalizeActionId(e.actionId);
                      if (nodes.has(aid)) {
                          reachable.add(aid);
                          queue.push(aid);
                      }
                  }
              }
          }
      }
  }
  // B. Component Events
  const traverseComponents = (comps: any[]) => {
      const stack = [...comps];
      while (stack.length) {
          const c = stack.shift();
          if (!c) continue;
          if (c.events) {
              for (const e of c.events) {
                  if (e.actionId) {
                      const aid = normalizeActionId(e.actionId);
                      if (nodes.has(aid)) {
                          reachable.add(aid);
                          queue.push(aid);
                      }
                  }
              }
          }
          if (c.children) stack.push(...c.children);
      }
  };
  
  traverseComponents(components);
  if (mutation.pagesAdded) {
      for (const p of mutation.pagesAdded) {
          if (p.components) traverseComponents(p.components);
      }
  }
  
  // C. Explicit Triggers (State Change)
  for (const [id, node] of nodes) {
      for (const t of node.triggers) {
          if (t.type === "state_change" || t.type === "lifecycle") {
              reachable.add(id);
              queue.push(id);
          }
      }
  }

  // Traverse
  while (queue.length > 0) {
      const curr = queue.shift()!;
      const node = nodes.get(curr);
      if (!node) continue;

      // Find actions triggered by this action's output (state mutation)
      // This requires knowing what state keys this action mutates
      const actionDef = actions.find((a: any) => normalizeActionId(a.id) === curr);
      if (actionDef) {
          const mutatedKeys = getMutatedKeys(actionDef);
          for (const key of mutatedKeys) {
              // Find actions triggered by this state key
              for (const [otherId, otherNode] of nodes) {
                  if (otherId === curr) continue;
                  if (otherNode.triggers.some((t: any) => t.type === "state_change" && t.stateKey === key)) {
                      if (!reachable.has(otherId)) {
                          reachable.add(otherId);
                          queue.push(otherId);
                      }
                  }
              }
          }
      }
  }

  // Heal Unreachable
  for (const [id, node] of nodes) {
      if (!reachable.has(id)) {
          // Auto-bind to onPageLoad of first page
          const firstPage = pages[0] || (currentSpec as any)?.pages?.[0];
          if (firstPage) {
              const actionDef = actions.find((a: any) => normalizeActionId(a.id) === id);
              if (actionDef) {
                  console.warn(`[ActionGraph] Healing unreachable action ${id} -> Bind to ${firstPage.id || firstPage.pageId}.onPageLoad`);
                  
                  // Add to page events
                  mutation.pagesUpdated = mutation.pagesUpdated ?? [];
                  let pageUpdate = mutation.pagesUpdated.find((u: any) => u.pageId === (firstPage.id || firstPage.pageId));
                  if (!pageUpdate) {
                      pageUpdate = { pageId: (firstPage.id || firstPage.pageId), patch: { events: [] } };
                      mutation.pagesUpdated.push(pageUpdate);
                  }
                  pageUpdate.patch.events = pageUpdate.patch.events ?? [];
                  pageUpdate.patch.events.push({
                      type: "onPageLoad",
                      actionId: actionDef.id,
                      args: { autoAttached: true, reason: "graph_healing" }
                  });
                  
                  // Update action trigger info for consistency
                  actionDef.triggeredBy = actionDef.triggeredBy || [];
                  if (!Array.isArray(actionDef.triggeredBy)) actionDef.triggeredBy = [actionDef.triggeredBy];
                  actionDef.triggeredBy.push({ type: "lifecycle", event: "onPageLoad" });
                  
                  madeChanges = true;
              }
          }
      }
  }

  // Refresh node trigger metadata after potential healing
  if (madeChanges) {
    for (const [id, node] of nodes) {
      const actionDef = actions.find((a: any) => normalizeActionId(a.id) === id);
      if (actionDef) {
        const triggers = Array.isArray(actionDef.triggeredBy)
          ? actionDef.triggeredBy
          : actionDef?.triggeredBy
            ? [actionDef.triggeredBy]
            : [];
        node.triggers = triggers;
      }
    }
  }

  const reachableFinal = new Set<string>();
  const queueFinal: string[] = [];

  const traverseComponentsFinal = (comps: any[]) => {
      const stack = [...comps];
      while (stack.length) {
          const c = stack.shift();
          if (!c) continue;
          if (c.events) {
              for (const e of c.events) {
                  if (e.actionId) {
                      const aid = normalizeActionId(e.actionId);
                      if (nodes.has(aid)) {
                          reachableFinal.add(aid);
                          queueFinal.push(aid);
                      }
                  }
              }
          }
          if (c.children) stack.push(...c.children);
      }
  };

  if (mutation.pagesAdded) {
      for (const p of mutation.pagesAdded) {
          if (p.events) {
              for (const e of p.events) {
                  if (e.actionId) {
                      const aid = normalizeActionId(e.actionId);
                      if (nodes.has(aid)) {
                          reachableFinal.add(aid);
                          queueFinal.push(aid);
                      }
                  }
              }
          }
          if (p.components) traverseComponentsFinal(p.components);
      }
  }
  if (mutation.pagesUpdated) {
      for (const u of mutation.pagesUpdated) {
          const events = u.patch?.events;
          if (!events) continue;
          for (const e of events) {
              if (e && e.actionId) {
                  const aid = normalizeActionId(e.actionId);
                  if (nodes.has(aid)) {
                      reachableFinal.add(aid);
                      queueFinal.push(aid);
                  }
              }
          }
      }
  }
  traverseComponentsFinal(components);
  for (const [id, node] of nodes) {
      for (const t of node.triggers) {
          if (t.type === "state_change" || t.type === "lifecycle") {
              reachableFinal.add(id);
              queueFinal.push(id);
          }
      }
  }

  while (queueFinal.length > 0) {
      const curr = queueFinal.shift()!;
      const node = nodes.get(curr);
      if (!node) continue;

      const actionDef = actions.find((a: any) => normalizeActionId(a.id) === curr);
      if (actionDef) {
          const mutatedKeys = getMutatedKeys(actionDef);
          for (const key of mutatedKeys) {
              for (const [otherId, otherNode] of nodes) {
                  if (otherId === curr) continue;
                  if (otherNode.triggers.some((t: any) => t.type === "state_change" && t.stateKey === key)) {
                      if (!reachableFinal.has(otherId)) {
                          reachableFinal.add(otherId);
                          queueFinal.push(otherId);
                      }
                  }
              }
          }
      }
  }

  const unreachable = Array.from(nodes.keys()).filter((id) => !reachableFinal.has(id));
  if (unreachable.length > 0) {
      console.warn(
          `[ActionGraph] Warning: Assemblr could not prove reachability for actions: ${unreachable.join(", ")}. They will be retained but may never execute.`,
      );
      // NON-BLOCKING: Do not throw. Just let them be orphans.
  }
}

export function buildExecutionGraph(intent: CompiledIntent, currentSpec?: ToolSpec) {
  if (
    intent.execution_graph &&
    Array.isArray(intent.execution_graph.nodes) &&
    intent.execution_graph.nodes.length > 0 &&
    Array.isArray(intent.execution_graph.edges)
  ) {
    return;
  }
  if (intent.intent_type !== "create" && intent.intent_type !== "modify") {
    intent.execution_graph = intent.execution_graph || { nodes: [], edges: [] };
    return;
  }
  const mutation = intent.tool_mutation as any;
  if (!mutation) {
    intent.execution_graph = { nodes: [], edges: [] };
    return;
  }
  const actions = mutation.actionsAdded ?? [];
  if (!actions.length) {
    intent.execution_graph = { nodes: [], edges: [] };
    return;
  }
  const nodes: any[] = [];
  const edges: any[] = [];
  const actionById = new Map<string, any>();
  const mutatedByKey = new Map<string, Set<string>>();
  const rootKindById = new Map<string, string>();
  const markRoot = (rawId: string | undefined, kind: string) => {
    if (!rawId) return;
    const id = normalizeActionId(rawId);
    const existing = rootKindById.get(id);
    if (existing === "lifecycle") return;
    if (existing === "ui" && kind === "state") return;
    rootKindById.set(id, kind);
  };
  const addFromNode = (node: any, kind: string) => {
    if (!node || !Array.isArray(node.events)) return;
    for (const e of node.events) {
      if (!e || !e.actionId) continue;
      const eventType = typeof e.type === "string" ? e.type : "";
      const k = eventType === "onPageLoad" ? "lifecycle" : kind;
      markRoot(e.actionId, k);
    }
  };
  const components = mutation.componentsAdded ?? [];
  const pages = mutation.pagesAdded ?? [];
  for (const a of actions) {
    if (!a || !a.id) continue;
    const id = normalizeActionId(a.id);
    actionById.set(id, a);
    const mutated = getMutatedKeys(a);
    for (const key of mutated) {
      if (!mutatedByKey.has(key)) mutatedByKey.set(key, new Set());
      mutatedByKey.get(key)!.add(id);
    }
    const triggers = Array.isArray(a.triggeredBy) ? a.triggeredBy : a.triggeredBy ? [a.triggeredBy] : [];
    for (const t of triggers) {
      if (!t || !t.type) continue;
      if (t.type === "lifecycle") {
        markRoot(id, "lifecycle");
      } else if (t.type === "component_event") {
        markRoot(id, "ui");
      } else if (t.type === "state_change") {
        markRoot(id, "state");
      }
    }
  }
  for (const c of components) addFromNode(c, "ui");
  for (const p of pages) {
    addFromNode(p, "lifecycle");
    if (Array.isArray(p.components)) {
      const stack: any[] = [...p.components];
      while (stack.length) {
        const n = stack.shift();
        if (!n) continue;
        addFromNode(n, "ui");
        if (Array.isArray(n.children)) stack.push(...n.children);
      }
    }
  }
  if (currentSpec && (currentSpec as any).kind === "mini_app") {
    const mini: any = currentSpec as any;
    for (const p of mini.pages ?? []) {
      addFromNode(p, "lifecycle");
      for (const c of p.components ?? []) {
        const stack: any[] = [c];
        while (stack.length) {
          const n = stack.shift();
          if (!n) continue;
          addFromNode(n, "ui");
          if (Array.isArray(n.children)) stack.push(...n.children);
        }
      }
    }
  }
  const edgeSet = new Set<string>();
  for (const a of actions) {
    if (!a || !a.id) continue;
    const id = normalizeActionId(a.id);
    const triggers = Array.isArray(a.triggeredBy) ? a.triggeredBy : a.triggeredBy ? [a.triggeredBy] : [];
    for (const t of triggers) {
      if (!t || t.type !== "state_change" || !t.stateKey) continue;
      const producers = Array.from(mutatedByKey.get(t.stateKey) ?? new Set<string>()).sort();
      for (const fromId of producers) {
        if (fromId === id) continue;
        const key = `${fromId}->${id}`;
        if (edgeSet.has(key)) continue;
        edgeSet.add(key);
        edges.push({ from: fromId, to: id });
      }
    }
  }
  for (const [id, action] of actionById.entries()) {
    let nodeType: "integration_call" | "transform" | "condition" | "emit_event";
    if (action.type === ACTION_TYPES.INTEGRATION_CALL) {
      let capId: string | undefined = action.config?.capabilityId;
      let validCapability = false;
      if (typeof capId === "string" && capId.length > 0) {
        const cap = getCapability(capId);
        if (cap) {
          validCapability = true;
        }
      }
      if (!validCapability) {
        nodeType = "emit_event";
        capId = undefined;
        if (action.config) {
          action.config.ephemeral_internal = true;
        } else {
          action.config = { ephemeral_internal: true };
        }
      } else {
        nodeType = action.effectOnly ? "emit_event" : "integration_call";
      }
      if (!action.config) {
        action.config = {};
      }
      if (!validCapability) {
        delete action.config.capabilityId;
      }
    } else if (action.type === ACTION_TYPES.INTERNAL || action.type === ACTION_TYPES.WORKFLOW) {
      nodeType = "transform";
    } else if (action.type === ACTION_TYPES.NAVIGATION) {
      nodeType = "emit_event";
    } else {
      nodeType = "transform";
    }
    const rawKind = rootKindById.get(id);
    const entryKind = rawKind === "state" ? "synthetic" : rawKind;
    const params = { ...(action.config ?? {}), entry_kind: entryKind };
    const node: any = {
      id,
      type: nodeType,
      capabilityId: action.config?.capabilityId,
      params,
    };
    nodes.push(node);
  }
  if (!nodes.length && actions.length) {
    const e: any = new Error("Assemblr could not construct an execution graph from actions.");
    e.code = "InvalidIntentGraph";
    e.meta = {
      type: "InvalidIntentGraph",
      reason: "SandboxExecutionFailed",
      details: "No execution nodes were produced from actionsAdded.",
      status: "rejected",
    };
    throw e;
  }
  const indegree = new Map<string, number>();
  for (const n of nodes) indegree.set(n.id, 0);
  for (const e of edges) indegree.set(e.to, (indegree.get(e.to) || 0) + 1);
  const roots: string[] = [];
  for (const [id, deg] of indegree.entries()) {
    if (deg === 0) roots.push(id);
  }
  
  // Auto-connect roots to a synthetic init node to ensure graph connectivity and validity
  if (nodes.length > 0) {
    const initId = "__init__";
    const initNode: any = {
      id: initId,
      type: "emit_event",
      params: { entry_kind: "synthetic" },
    };
    nodes.unshift(initNode);
    for (const rootId of roots) {
      if (rootId === initId) continue;
      // Filter: Only connect lifecycle roots (onPageLoad) to __init__
      // UI actions (triggered by onClick, etc) should NOT be connected to __init__
      // as they are not triggered by app initialization.
      const rawKind = rootKindById.get(rootId);
      if (rawKind === "lifecycle" || rawKind === "synthetic" || !rawKind) {
         edges.push({ from: initId, to: rootId });
      }
    }
  }

  if (nodes.length > 1 && edges.length === 0) {
    console.warn("[GraphDebugWarning] Execution graph has multiple nodes but no edges", {
      nodeIds: nodes.map((n) => n.id),
    });
  }
  intent.execution_graph = { nodes, edges };
}

export function simulateExecution(intent: CompiledIntent): { success: boolean; logs: string[] } {
  const logs: string[] = [];
  const mutation = intent.tool_mutation;
  if (!mutation) return { success: true, logs };

  const actions = mutation.actionsAdded ?? [];
  const state = { ...mutation.stateAdded }; // Simulation state

  // Simple simulation of "onPageLoad"
  logs.push("--- Dry Run Start: onPageLoad ---");
  
  // 1. Identify onPageLoad actions
  const queue: string[] = [];
  
  // From pagesAdded
  if (mutation.pagesAdded) {
      for (const p of mutation.pagesAdded) {
          if (p.events) {
              for (const e of p.events) {
                  if (e.type === "onPageLoad" && e.actionId) {
                      queue.push(normalizeActionId(e.actionId));
                  }
              }
          }
      }
  }
  // From pagesUpdated
  if (mutation.pagesUpdated) {
      for (const u of mutation.pagesUpdated) {
          if (u.patch?.events) {
              for (const e of u.patch.events) {
                  if (e.type === "onPageLoad" && e.actionId) {
                      queue.push(normalizeActionId(e.actionId));
                  }
              }
          }
      }
  }

  const visited = new Set<string>();
  const MAX_STEPS = 100;
  let steps = 0;

  while (queue.length > 0 && steps < MAX_STEPS) {
      const currId = queue.shift()!;
      if (visited.has(currId)) {
          logs.push(`Loop detected at ${currId}. Skipping.`);
          continue;
      }
      visited.add(currId);
      steps++;

      const action = actions.find((a: any) => normalizeActionId(a.id) === currId);
      if (!action) {
          logs.push(`Action ${currId} not found in definition.`);
          continue;
      }

      logs.push(`Executing ${action.id} (${action.type})`);

      // Apply effects
      if (action.type === "state_mutation" || action.type === "internal") {
          const updates = action.config?.updates ?? action.config?.set ?? action.config?.assign;
          if (updates) {
              for (const key of Object.keys(updates)) {
                  state[key] = "SIMULATED_VALUE";
                  logs.push(`  -> Mutated ${key}`);
                  
                  // Trigger downstream
                  const downstream = actions.filter((a: any) => {
                      const triggers = Array.isArray(a.triggeredBy) ? a.triggeredBy : (a.triggeredBy ? [a.triggeredBy] : []);
                      return triggers.some((t: any) => t.type === "state_change" && t.stateKey === key);
                  });
                  
                  for (const ds of downstream) {
                      const dsId = normalizeActionId(ds.id);
                      if (!visited.has(dsId) && !queue.includes(dsId)) {
                          queue.push(dsId);
                          logs.push(`    -> Triggered ${ds.id}`);
                      }
                  }
              }
          }
      }
  }

  if (steps >= MAX_STEPS) {
      logs.push("WARNING: Simulation hit step limit. Possible infinite loop.");
      return { success: false, logs };
  }

  logs.push("--- Dry Run Complete ---");
  return { success: true, logs };
}

export function normalizeIntentSpec(intent: CompiledIntent) {
    if (!intent.tool_mutation) return;
    const m = intent.tool_mutation;

    // 1. Normalize Derivations (Array -> Object)
    if (m.stateAdded && m.stateAdded.__derivations) {
        if (Array.isArray(m.stateAdded.__derivations)) {
            const map: Record<string, any> = {};
            for (const d of m.stateAdded.__derivations) {
                if (d.target) {
                    map[d.target] = d;
                }
            }
            m.stateAdded.__derivations = map;
        }
    }

    // 2. Ensure Execution Graph
    if (!intent.execution_graph) {
        intent.execution_graph = { nodes: [], edges: [] };
    }

    // 3. Normalize Actions
    if (m.actionsAdded) {
        for (const a of m.actionsAdded) {
            // Ensure ID is normalized
            if (a.id) a.id = normalizeActionId(a.id);
            // Ensure config exists
            if (!a.config) a.config = {};
        }
    }
    
    // 4. Normalize Page Events
    if (m.pagesAdded) {
        for (const p of m.pagesAdded) {
            if (p.events) {
                for (const e of p.events) {
                    if (e.actionId) e.actionId = normalizeActionId(e.actionId);
                }
            }
        }
    }
}

export function validateCompiledIntent(intent: CompiledIntent, currentSpec?: ToolSpec, options?: { mode?: "create" | "chat" | "modify" }) {
  if (intent.intent_type !== "create" && intent.intent_type !== "modify") return;

  // 0. SYSTEMIC FIX: Normalization Pass
  // Enforce canonical spec shape before any validation or execution
  normalizeIntentSpec(intent);

  // 0. SYSTEMIC FIX: Graph Validation & Healing (Part 1)
  // This runs before standard validation to ensure the graph is connected and valid.
  try {
      validateActionGraph(intent, currentSpec);
  } catch (e) {
      console.warn("[GraphValidation] Graph validation failed (non-fatal), suppressing error:", e);
      // Fallback: Ensure we have a valid empty graph if validation blew up
      if (!intent.execution_graph || !intent.execution_graph.nodes) {
          intent.execution_graph = { nodes: [], edges: [] };
      }
  }

  // 0.0 Build Execution Graph for Sandbox Simulation
  try {
      buildExecutionGraph(intent, currentSpec);
  } catch (e) {
      console.warn("[GraphBuild] Execution graph build failed (non-fatal):", e);
      intent.execution_graph = { nodes: [], edges: [] };
  }

  // 0.1 PRE-EXECUTION DRY RUN (Part 6)
  // Simulate execution to detect deadlocks or logic errors.
  const simulation = simulateExecution(intent);
  if (!simulation.success) {
      console.warn("[DryRun] Simulation completed with warnings:", simulation.logs);
      // In Non-Fatal Mode, we log but proceed. 
      // Ideally we could attach these logs to the intent for the runtime to display in a debug panel.
  }

  // 0.2 VALIDATE UI REFERENCES (Strict Mode)
  try {
      validateUIReferences(intent, currentSpec);
  } catch (e) {
      console.error("[Compiler] UI Reference Validation Failed:", e);
      throw e; 
  }

  const sandbox = runIntentInSandbox(intent);
  if (!sandbox.ok) {
      console.warn("[SandboxValidation] Non-fatal execution graph issue detected", sandbox.error);
  }

  const mutation = intent.tool_mutation;
  if (!mutation) return;

  const existingMini = currentSpec && (currentSpec as any).kind === "mini_app" ? (currentSpec as any) : null;
  const existingComponents = existingMini ? flattenMiniAppComponents(existingMini).map((x) => x.component) : [];
  const existingPages = existingMini ? (existingMini.pages ?? []) : [];
  
  const allowedTypes = new Set(["container", "text", "button", "input", "select", "dropdown", "list", "table", "card", "heatmap"]);
  const components = mutation.componentsAdded || [];
  for (const c of components) {
    const rawType = typeof c.type === "string" ? c.type : "";
    const normalizedType = rawType.toLowerCase();
    if (!normalizedType || !allowedTypes.has(normalizedType)) {
      console.warn("[PlannerValidation] Unsupported or missing component type in componentsAdded", {
        id: c.id,
        type: c.type,
      });
      c.type = "container";
    } else {
      c.type = normalizedType;
    }

    if (c.children != null) {
      const normalizedChildren: string[] = [];
      const rawChildren: any = c.children as any;

      const pushChild = (val: any) => {
        if (typeof val === "string") {
          normalizedChildren.push(val);
          return;
        }
        if (val && typeof val === "object") {
          const childId = typeof (val as any).id === "string" ? (val as any).id : undefined;
          if (childId) {
            normalizedChildren.push(childId);
          } else {
            console.warn("[PlannerValidation] Dropped child without id on component", { parentId: c.id, child: val });
          }
          return;
        }
        console.warn("[PlannerValidation] Dropped non-object child on component", { parentId: c.id, child: val });
      };

      if (Array.isArray(rawChildren)) {
        for (const child of rawChildren) pushChild(child);
      } else if (rawChildren && typeof rawChildren === "object") {
        const keys = Object.keys(rawChildren);
        const indexKeys = keys.filter((k) => /^\d+$/.test(k));
        if (indexKeys.length && indexKeys.length === keys.length) {
          indexKeys.sort((a, b) => Number(a) - Number(b));
          for (const k of indexKeys) pushChild((rawChildren as any)[k]);
        } else {
          pushChild(rawChildren);
        }
      } else {
        console.warn("[PlannerValidation] Dropped invalid children payload on component", { parentId: c.id, children: rawChildren });
      }

      c.children = normalizedChildren.length ? normalizedChildren : undefined;
    }

    // Fix: itemTemplate.onClick
    if (c.properties?.itemTemplate?.onClick || c.properties?.itemTemplate?.events?.some((e: any) => e.type === "onClick")) {
        throw new Error(`Component ${c.id} defines onClick on itemTemplate. This is invalid. Use 'onSelect' on the List component itself.`);
    }

    // Fix 5: Illegal Negation in disabledKey
    if (c.properties?.disabledKey && c.properties.disabledKey.startsWith("!")) {
        throw new Error(`Invalid disabledKey: '${c.properties.disabledKey}'. Runtime expects a state key, not an expression. Use a derived boolean state variable instead.`);
    }

    // Fix 6: List Item Rendering Contract
    if (c.type.toLowerCase() === "list") {
        const hasItemProps = !!c.properties?.itemProps;
        const hasItemComponent = !!c.properties?.itemComponent;
        const hasChildren = Array.isArray(c.children) && c.children.length > 0;

        if (hasItemProps && (hasItemComponent || hasChildren)) {
             throw new Error(`List component ${c.id} mixes rendering models. Use 'itemProps' exclusively (Recommended) or 'itemComponent'.`);
        }
        if (!hasItemProps && !hasItemComponent && !hasChildren) {
             // Maybe acceptable for empty list? But ideally should have one.
        }
    }

    // Fix 4: Select Binding & Contract
    if (c.type.toLowerCase() === "select" || c.type.toLowerCase() === "dropdown") {
      const props = c.properties || {};

      // 4a. Enforce optionValueKey presence (no silent fallback)
      const optionValueKey = props.optionValueKey;
      if (optionValueKey === undefined || optionValueKey === null || optionValueKey === "") {
        throw new Error(
          `Select component ${c.id} is missing 'optionValueKey'. It must default to 'value' explicitly at authoring time.`,
        );
      }

      // 4b. Enforce exclusive binding model: either bindKey (controlled) OR stateUpdate, but never both or neither
      const hasBindKey = typeof props.bindKey === "string" && props.bindKey.length > 0;
      let hasStateUpdate = false;
      if (Array.isArray(c.events)) {
        for (const e of c.events) {
          if (e && e.stateUpdate && typeof e.stateUpdate === "object" && Object.keys(e.stateUpdate).length > 0) {
            hasStateUpdate = true;
            break;
          }
        }
      }
      if ((hasBindKey && hasStateUpdate) || (!hasBindKey && !hasStateUpdate)) {
        throw new Error(
          `Select component ${c.id} must use exactly one of 'bindKey' (controlled) or 'stateUpdate', but not both or neither.`,
        );
      }

      // 4c. Normalize unsafe empty option values
      if (Array.isArray(props.options)) {
        for (const opt of props.options) {
          if (opt && typeof opt === "object") {
            if (opt.value === "" || opt.value === null || opt.value === undefined) {
              opt.value = SELECT_ALL_VALUE;
              console.warn(
                `[PlannerValidation] Normalized unsafe empty option value on Select ${c.id} to '${SELECT_ALL_VALUE}'.`,
              );
            }
          }
        }
      }
    }

    // Fix 7: Interactive Component Safety (Button)
    if (c.type.toLowerCase() === "button") {
        const hasClick = c.events?.some((e: any) => e.type === "onClick");
        if (!hasClick) {
            console.warn(`[PlannerSafety] Button ${c.id} has no onClick handler. Auto-correcting to disabled state.`);
            c.properties = c.properties || {};
            c.properties.disabled = true; // Safe default: disable dead buttons
        }
    }

    // Fix 8: Unsafe Visibility Guard
    if (c.properties?.visible) {
         const vis = c.properties.visible;
         if (typeof vis === "string" && vis.includes(".") && !vis.startsWith("has") && !vis.startsWith("is")) {
             console.warn(`[PlannerSafety] Component ${c.id} uses potentially unsafe visibility '${vis}'. Prefer boolean flags (hasX, isY).`);
         }
    }
  }

  // 2. Validate Event Wiring (STRICT MODE)
  const actions = mutation.actionsAdded || [];

  // 0. Planner Invariant Check (Action Types & Banned Keys)
  const allowedActionTypes = new Set(Object.values(ACTION_TYPES));
  const bannedKeys = ["__derivation", "__from", "__fromTableSelection"];

  let hasIntegrationQuery = false;

  for (const a of actions) {
    if (!allowedActionTypes.has(a.type)) {
      throw new Error(`PlannerInvariantError: Invalid action type '${a.type}' for action '${a.id}'. Allowed: ${Array.from(allowedActionTypes).join(", ")}`);
    }

    if (a.type === ACTION_TYPES.INTEGRATION_QUERY) {
        hasIntegrationQuery = true;
    }

    // 2️⃣ HARD SYSTEM RULE: Data Authority
    // "Any action assigning array data must declare its data authority"
    if (a.type === ACTION_TYPES.INTERNAL) {
        const assign = a.config?.assign;
        if (typeof assign === "string") {
             // Heuristic: Common data keys
             if (assign === "activities" || assign === "items" || assign === "data" || assign === "rows") {
                 throw new Error(`PlannerInvariantError: Action '${a.id}' uses 'internal' type to assign '${assign}'. This is forbidden. You MUST use 'integration_query' for data fetching.`);
             }
        }
    }

    if (a.config) {
        // Deep check for banned keys
        const str = JSON.stringify(a.config);
        for (const ban of bannedKeys) {
            if (str.includes(`"${ban}"`)) {
                 throw new Error(`PlannerInvariantError: Action '${a.id}' uses banned key '${ban}'. Derived state must be declarative in components.`);
            }
        }
    }
  }

  // 2️⃣ HARD SYSTEM RULE: Dashboard Requirements
  // "Any dashboard must fail compilation if no integration OR fallback is defined"
  const hasDataComponent = (mutation.componentsAdded ?? []).some((c: any) => {
      const t = (c.type || "").toLowerCase();
      return t === "list" || t === "table" || t === "heatmap" || t === "chart";
  });

  if (hasDataComponent && !hasIntegrationQuery) {
      // Check if maybe we have a legacy integration_call acting as query?
      // Strict Mode: No. We require integration_query for data.
      // But let's check if there are ANY integration calls.
      const hasAnyIntegration = actions.some((a: any) => a.type === ACTION_TYPES.INTEGRATION_CALL);
      
      if (!hasAnyIntegration) {
           throw new Error("PlannerInvariantError: Dashboard contains data components (List/Table) but NO integration actions. You must define an 'integration_query' to fetch data.");
      }
  }

  const registry = new ActionRegistry(actions);

  normalizeLegacyActions(actions);
  
  if (existingMini && existingMini.actions) {
      registry.registerAll(existingMini.actions);
  }

  // A. Check for "Action defined but unreachable"
  const triggeredActions = analyzeActionReachability(mutation, currentSpec);
  const allActionIds = registry.getAllIds();
  
  for (const id of allActionIds) {
    const isNew = actions.some((a: any) => normalizeActionId(a.id) === id);
    if (isNew && !triggeredActions.has(id)) {
      const action = actions.find((a: any) => normalizeActionId(a.id) === id);
      let repaired = false;
      if (action) {
        repaired = tryAttachComponentTriggerFromSemantics(mutation, action);
        if (repaired) {
          triggeredActions.add(id);
        }
      }
      if (!repaired) {
        // Relaxed rule: If it's effect-only, we might allow it if it's implicitly triggered? 
        // No, effect-only actions still need a trigger.
        if (options?.mode === "create" && intent.intent_type === "create") {
          console.warn(
            `[PlannerValidation] Warning: Action ${id} is defined but never triggered by any component, page event, or explicit trigger (state_change/internal).`,
          );
        } else {
          console.warn(
            `[PlannerValidation] Warning: Action ${id} is defined but never triggered by any component, page event, or explicit trigger (state_change/internal).`,
          );
          // NON-FATAL: Do not throw
        }
      }
    }
  }

  // B. Check for "Trigger references missing action" (Strict Mode -> Warn Mode)
  const checkTrigger = (context: string, event: { actionId?: string }) => {
      if (!event.actionId) return;
      if (!registry.has(event.actionId)) {
          console.warn(`[PlannerValidation] Warning: ${context} references missing action '${event.actionId}'. Action call will be dropped at runtime.`);
      }
  };

  for (const c of (mutation.componentsAdded ?? [])) {
      if (c.events) c.events.forEach((e: any) => checkTrigger(`Component ${c.id}`, e));
  }
  for (const p of (mutation.pagesAdded ?? [])) {
      if (p.events) p.events.forEach((e: any) => checkTrigger(`Page ${p.id}`, e));
  }
  for (const u of (mutation.pagesUpdated ?? [])) {
      if (u.patch?.events) u.patch.events.forEach((e: any) => checkTrigger(`Page Update ${u.pageId}`, e));
  }

  // C. Check for Single Lifecycle Entrypoint
  const checkLifecycle = (events: any[], context: string) => {
      if (!events) return;
      const loads = events.filter((e: any) => e.type === "onPageLoad");
      if (loads.length > 1) {
          console.warn(`[PlannerValidation] Warning: ${context} has multiple onPageLoad triggers. Only the first will execute.`);
      }
  };
  for (const p of (mutation.pagesAdded ?? [])) checkLifecycle(p.events, `Page ${p.id}`);
  for (const u of (mutation.pagesUpdated ?? [])) checkLifecycle(u.patch?.events, `Page Update ${u.pageId}`);

  // Check triggers in existing app components if they were not modified? 
  // We only check new/modified parts to be safe, but Strict Mode implies we shouldn't allow broken refs.
  // For now, focus on the mutation payload.

  // 3. Validate State Usage (Mutations -> UI)
  const stateKeysRead = new Set<string>();
  const collectReadKeys = (c: any) => {
    if (c.dataSource?.type === "state" && c.dataSource.value) {
      stateKeysRead.add(c.dataSource.value);
    }
    if (c.properties?.bindKey) stateKeysRead.add(c.properties.bindKey);
    if (c.properties?.loadingKey) stateKeysRead.add(c.properties.loadingKey);
    if (c.properties?.errorKey) stateKeysRead.add(c.properties.errorKey);
    if (c.properties?.disabledKey) {
        // Handle "derived boolean state" reference or simple key
        stateKeysRead.add(c.properties.disabledKey.replace(/^!/, ""));
    }
    
    // Deep scan properties for {{state.key}}
    const scanObj = (obj: any) => {
        if (!obj || typeof obj !== "object") return;
        for (const val of Object.values(obj)) {
            if (typeof val === "string") {
                const matches = val.match(/{{state\.([a-zA-Z0-9_.$-]+)}}/g);
                if (matches) {
                    matches.forEach((m: string) => stateKeysRead.add(m.replace("{{state.", "").replace("}}", "")));
                }
            } else if (typeof val === "object") {
                scanObj(val);
            }
        }
    };
    scanObj(c.properties);
  };

  for (const c of components) collectReadKeys(c);
  // Also check componentsUpdated
  if (mutation.componentsUpdated) {
    for (const update of mutation.componentsUpdated) {
      if (update.patch) collectReadKeys({ properties: update.patch.properties, dataSource: update.patch.dataSource });
    }
  }
  if (existingMini) {
    for (const c of existingComponents) collectReadKeys(c);
  }

  for (const a of actions) {
    // Validate Action Types
    const allowedActionTypes = new Set<ActionType>([
      ACTION_TYPES.INTEGRATION_CALL,
      ACTION_TYPES.INTERNAL,
      ACTION_TYPES.NAVIGATION,
      ACTION_TYPES.WORKFLOW,
    ]);
    if (!allowedActionTypes.has(a.type as ActionType)) {
      throw new Error(
        `Action ${a.id} has invalid type '${a.type}'. Allowed: ${Array.from(allowedActionTypes).join(", ")}`,
      );
    }

    if (a.type === ACTION_TYPES.INTEGRATION_CALL) {
      const capId = a.config?.capabilityId;
      if (typeof capId === "string" && capId.length > 0) {
        const cap = getCapability(capId);
        if (!cap) {
          a.type = ACTION_TYPES.INTERNAL;
          a.config = { ...(a.config ?? {}), ephemeral_internal: true };
          if (a.config.capabilityId) {
            delete a.config.capabilityId;
          }
        }
      }
    }

    if (a.type === "integration_call") {
      const isInternal = a.config?.ephemeral_internal === true;
      const assignKey = a.config?.assign;
      if (assignKey) {
        continue;
      }
      const statusKey = a.effectOnly ? undefined : `${a.id}.status`;
      const errorKey = a.effectOnly ? undefined : `${a.id}.error`;

      const internalConsumes = (key: string | undefined) => {
        if (!key) return false;
        return actions.some((other: any) => {
          if (!other || other.id === a.id) return false;
          if (Array.isArray(other.inputs) && other.inputs.includes(key)) return true;
          const deps = extractStateDependencies(other);
          return deps.includes(key);
        });
      };

      const dataKey = `${a.id}.data`;
      const dataConsumed = stateKeysRead.has(dataKey) || internalConsumes(dataKey);

      const statusConsumed =
        (!!statusKey && stateKeysRead.has(statusKey)) ||
        (!!errorKey && stateKeysRead.has(errorKey)) ||
        internalConsumes(statusKey) ||
        internalConsumes(errorKey);

      if (!dataConsumed && !statusConsumed && !isInternal && !a.effectOnly) {
        throw new Error(
          `Integration action ${a.id} appears to be effect-only. If intentional, mark it as effectOnly: true.`,
        );
      }
    }
    if (a.type === "state_mutation") {
      const updates = a.config?.updates ?? a.config?.set ?? {};
      for (const key of Object.keys(updates)) {
        if (key.startsWith("_") || key.startsWith("__")) continue;
        if (!stateKeysRead.has(key)) {
          console.warn(`[PlannerValidation] Warning: Action ${a.id} mutates state key '${key}', but no component reads this key.`);
        }
      }
    }
  }

  if (existingMini) {
    const existingPairs = new Set(
      existingComponents
        .map((c: any) => {
          const bk = typeof c.properties?.bindKey === "string" ? c.properties.bindKey : "";
          const pid = existingPages.find((p: any) => (p.components ?? []).some((x: any) => x === c))?.id ?? "";
          return `${String(c.type).toLowerCase()}::${pid}::${bk}`;
        })
        .filter((x: string) => !x.endsWith("::")),
    );
    for (const c of components) {
      const bk = typeof c.properties?.bindKey === "string" ? c.properties.bindKey : "";
      if (!bk) continue;
      const pid = c.pageId ?? "";
      const key = `${String(c.type).toLowerCase()}::${pid}::${bk}`;
      if (existingPairs.has(key)) {
         // Downgrade to warning to allow "rebuilding" patterns without crashing
         console.warn(`[PlannerValidation] Duplicate control detected: a ${c.type} already binds to '${bk}' on page '${pid}'.`);
      }
    }
  }
}

function extractStateDependencies(action: any): string[] {
    const deps = new Set<string>();
    const str = JSON.stringify(action.config || {});
    const matches = str.match(/{{state\.([a-zA-Z0-9_.$-]+)}}/g);
    if (matches) {
        matches.forEach(m => deps.add(m.replace("{{state.", "").replace("}}", "")));
    }
    return Array.from(deps);
}

function normalizeLegacyActions(actions: any[]) {
  if (!Array.isArray(actions)) return;
  for (const a of actions) {
    if (!a || typeof a !== "object") continue;
    const legacyOps = new Set(["assign", "filter", "map", "derive_state", "derive", "update_state", "state_assign"]);
    if (typeof a.type === "string" && legacyOps.has(a.type)) {
      const op = a.type;
      a.type = ACTION_TYPES.INTERNAL;
      const cfg = a.config ?? {};
      // Preserve semantic intent for system-injected variants
      const semantic =
        op === "state_assign" || op === "update_state" ? "state_update" :
        op === "derive_state" || op === "derive" ? "derive_state" :
        op;
      a.config = { operation: op === "state_assign" ? "assign" : op, __semantic: semantic, ...cfg };
      if (op === "assign" || op === "state_assign") {
        const source = cfg.source ?? cfg.value ?? cfg.from;
        const target = cfg.target ?? cfg.key ?? cfg.to;
        if (source && target && !Array.isArray(a.steps)) {
          a.steps = [{ type: "state_mutation", config: { updates: { [String(target)]: source } } }];
        }
      }
    }
  }
}

export function repairCompiledIntent(intent: CompiledIntent, currentSpec?: ToolSpec) {
  const mutation = intent.tool_mutation as any;
  if (!mutation) return;
  hoistInlineEventActions(mutation);
  const actions = mutation.actionsAdded ?? [];
  const components = mutation.componentsAdded || [];

  if (Array.isArray(components)) {
    for (const c of components) {
      if (!c || typeof c !== "object") continue;
      if (c.type === "select" || c.type === "dropdown") {
        const props = (c.properties = c.properties || {});

        // Ensure optionValueKey has a concrete default early in the pipeline
        if (props.optionValueKey === undefined || props.optionValueKey === null || props.optionValueKey === "") {
          props.optionValueKey = "value";
        }

        if (Array.isArray(props.options)) {
          props.options = props.options.map((opt: any) => {
            if (!opt || typeof opt !== "object") return opt;
            if (opt.value === "" || opt.value === null || opt.value === undefined) {
              return { ...opt, value: SELECT_ALL_VALUE };
            }
            return opt;
          });
        }
      }
    }
  }

  if (mutation.stateAdded && typeof mutation.stateAdded === "object") {
    for (const [k, v] of Object.entries(mutation.stateAdded)) {
      if (typeof k === "string" && k.startsWith("filters.") && (v === "" || v === null || v === undefined)) {
        mutation.stateAdded[k] = SELECT_ALL_VALUE;
      }
    }
  }

  applyContainerPatchesToNewComponents(mutation);

  // 0. CANONICALIZE STATE KEYS (Pre-repair normalization)
  canonicalizeStateKeys(mutation);

  // 0.1 ENFORCE CANONICAL FILTER NAMESPACE
  if (mutation.stateAdded) {
      const renames: Record<string, string> = {};
      for (const key of Object.keys(mutation.stateAdded)) {
          // Map filter_tool, tool_filter, activityToolFilter -> filters.tool
          if (key === "filter_tool" || key === "tool_filter" || key === "activityToolFilter") {
              renames[key] = "filters.tool";
          } else if (key === "filter_type" || key === "type_filter" || key === "activityTypeFilter") {
              renames[key] = "filters.activityType";
          } else if (key === "filter_time" || key === "time_filter" || key === "timeRange") {
              renames[key] = "filters.timeRange";
          }
      }
      if (Object.keys(renames).length > 0) {
          console.log(`[SystemHardening] Canonicalizing filter keys:`, renames);
          // Apply renames using existing helper logic (we can just inject into aliasMap logic inside canonicalizeStateKeys if we move this there, 
          // or run a mini-pass here. Let's reuse renameStateKey logic or just update stateAdded and alias map later?
          // Actually, canonicalizeStateKeys is designed for this. Let's enhance IT instead.)
      }
  }

  // 1. NORMALIZE ALL ACTION IDs IMMEDIATELY (Strict Mode)
  for (const a of actions) {
      if (a.id) {
          a.id = normalizeActionId(a.id);
      }
  }

  const allowedActionTypes = new Set(Object.values(ACTION_TYPES));
  const convertibleTypes = new Set([
    "assign",
    "state_update",
    "state_mutation",
    "state_assign",
    "state_transform",
    "transform",
    "filter",
  ]);
  for (const a of actions) {
      if (convertibleTypes.has(a.type)) {
          continue;
      }
      if (!allowedActionTypes.has(a.type)) {
          const original = a.type;
          if (["state_transform", "transform", "filter", "map", "update_state", "set_status"].some(t => original.includes(t))) {
              a.type = ACTION_TYPES.INTERNAL;
              a.config = { __semantic: original, ...(a.config ?? {}) };
              console.log(`[SystemHardening] Normalized invalid action type '${original}' to 'internal' for action ${a.id}`);
          } else if (original.includes("flow") || original.includes("step")) {
              a.type = ACTION_TYPES.WORKFLOW;
              console.log(`[SystemHardening] Normalized invalid action type '${original}' to 'workflow' for action ${a.id}`);
          } else {
              const e: any = new Error(
                  `Unsupported action type '${original}' for action '${a.id}'. Allowed types: ${Array.from(allowedActionTypes).join(
                      ", ",
                  )}.`,
              );
              e.code = "InvalidIntentGraph";
              e.meta = {
                  type: "InvalidIntentGraph",
                  reason: "UnsupportedActionType",
                  actionId: a.id,
                  originalType: original,
                  allowedTypes: Array.from(allowedActionTypes),
                  status: "rejected",
              };
              throw e;
          }
      }
  }

  normalizeLegacyActions(actions);

  // 1.5 REMOVE EXPLICIT STATUS ACTIONS (Systemic Fix: Status is runtime-managed)
  const actionsToRemove = new Set<string>();
  for (const a of actions) {
      const isStatusAction = 
          a.id.includes("set_status") || 
          a.id.includes("mirror_status") ||
          (a.config?.__semantic === "status_mirror");
      
      if (isStatusAction) {
          actionsToRemove.add(a.id);
          console.log(`[SystemAutoWiring] Removed explicit status action ${a.id} (handled by runtime)`);
          continue;
      }

      if (a.type === "state_mutation" || a.type === "internal") {
          const updates = a.config?.updates ?? a.config?.set ?? a.config?.assign;
          if (updates && typeof updates === "object") {
              const keys = Object.keys(updates);
              const allStatus = keys.length > 0 && keys.every(k => k.endsWith("Status") || k.endsWith("Error"));
              if (allStatus) {
                  actionsToRemove.add(a.id);
                  console.log(`[SystemAutoWiring] Removed explicit status action ${a.id} (handled by runtime)`);
              }
          }
      }
  }

  // 1.6 REPAIR FILTER ACTIONS -> DECLARATIVE COMPONENT SOURCE
  for (const a of actions) {
     if (actionsToRemove.has(a.id)) continue;
     
     // Detect filter logic
     if (a.type === "internal" && a.config?.operation === "assign" && a.config?.assign) {
         for (const [targetKey, def] of Object.entries(a.config.assign)) {
             if (def && typeof def === "object" && ((def as any).logic === "filter" || (def as any).transform === "filter")) {
                 const sourceKey = (def as any).deriveFrom?.[0];
                 if (!sourceKey) continue;
                 
                 // Find components using targetKey
                 let converted = false;
                 const updateComponent = (c: any) => {
                     if (c.dataSource?.type === "state" && c.dataSource.value === targetKey) {
                         // Find filter keys from action triggers
                         const triggers = Array.isArray(a.triggeredBy) ? a.triggeredBy : (a.triggeredBy ? [a.triggeredBy] : []);
                         const filterKeys = triggers
                            .filter((t: any) => t.type === "state_change" && t.stateKey)
                            .map((t: any) => t.stateKey)
                            .filter((k: string) => k !== sourceKey);
                         
                         c.dataSource = {
                             type: "derived",
                             source: sourceKey,
                             filters: filterKeys
                         };
                         
                         converted = true;
                         console.log(`[SystemAutoWiring] Converted filter action ${a.id} to declarative dataSource on ${c.id}`);
                     }
                     if (c.children) c.children.forEach(updateComponent);
                 };
                 components.forEach(updateComponent);
                 
                 if (converted) {
                     actionsToRemove.add(a.id);
                 }
             }
         }
     }
  }

  // Execute removals
  if (actionsToRemove.size > 0) {
      const kept = [];
      for (const a of actions) {
          if (!actionsToRemove.has(a.id)) kept.push(a);
      }
      mutation.actionsAdded = kept;
      // Re-assign local ref if needed, but array mutation is safer if we just splice.
      // But here we replaced the array in mutation, but 'actions' local var is stale.
      // Better to splice in place to keep 'actions' ref valid.
      for (let i = actions.length - 1; i >= 0; i--) {
          if (actionsToRemove.has(actions[i].id)) {
              actions.splice(i, 1);
          }
      }
  }

  // 2. CONVERT INVALID ACTION TYPES (Systemic Fix)
  for (const a of actions) {
    if (["state_update", "state_mutation", "state_assign", "state_transform", "transform", "filter"].includes(a.type)) {
      const originalType = a.type;
      a.type = ACTION_TYPES.INTERNAL;

      // Special handling for state_transform
      if (originalType === "state_transform" || originalType === "transform") {
          const target = a.config?.target ?? a.config?.to ?? a.config?.assign;
          const source = a.config?.source ?? a.config?.from ?? a.config?.value;
          const logic = a.config?.transform ?? a.config?.operation ?? "transform";
          
          if (target) {
               a.config = {
                   operation: "assign",
                   assign: {
                       [target]: {
                           deriveFrom: Array.isArray(source) ? source : [source],
                           logic: logic
                       }
                   },
                   ...(a.config ?? {})
               };
               // Clean up old keys to avoid confusion
               delete a.config.target;
               delete a.config.source;
               delete a.config.from;
               delete a.config.to;
               delete a.config.transform;
          }
      } else {
          // Existing logic for state_mutation/update
          const updates = a.config?.updates ?? a.config?.set;
          if (updates && !Array.isArray(a.steps)) {
            a.steps = [
              {
                type: "state_mutation",
                config: { updates },
              },
            ];
            delete a.config?.updates;
            delete a.config?.set;
          }
      }
      
      a.config = { __semantic: (a.config && a.config.__semantic) || (originalType === "state_assign" ? "state_update" : originalType), ...(a.config ?? {}) };
      console.log(`[SystemAutoWiring] Converted action ${a.id} from '${originalType}' to 'internal'`);
    }
  }

  for (const c of components) {
      if (c.properties) {
           for (const [key, val] of Object.entries(c.properties)) {
               if (typeof val === "string" && val.startsWith("state.")) {
                   c.properties[key] = val.replace(/^state\./, "");
               }
           }
      }
      if (c.dataSource?.type === "state" && c.dataSource.value?.startsWith("state.")) {
           c.dataSource.value = c.dataSource.value.replace(/^state\./, "");
      }

      // Enforce declarative visibility: visible/disabled/style.expr must reference state keys or derived keys, not inline boolean expressions
      const props = c.properties || {};
      const visibleIf = props.visibleIf;
      if (visibleIf !== undefined) {
          const isObjectRef = visibleIf && typeof visibleIf === "object" && typeof visibleIf.stateKey === "string";
          const isSimpleStateRef =
              typeof visibleIf === "string" &&
              /^{{state\.([a-zA-Z0-9_.$-]+)}}$/.test(visibleIf);
          if (!isObjectRef && !isSimpleStateRef && typeof visibleIf !== "boolean") {
              throw new Error(
                  `Component ${c.id} has non-declarative 'visibleIf'. It must reference a state or derived key (e.g., { stateKey: 'hasSelectedActivityWithUrl', equals: true }).`,
              );
          }
      }

      if (Array.isArray(c.events)) {
        c.events = c.events.map((e: any) => {
          if (!e || typeof e !== "object") return e;
          const t = typeof e.type === "string" ? normalizeComponentEventType(c.type, e.type) : e.type;
          return { ...e, type: t };
        });
      }

      if (Array.isArray(c.children)) {
          c.children = c.children.map((child: any) => {
              if (typeof child === "string") return child;
              if (child.id) return child.id;
              return null;
          }).filter(Boolean);
      }

      if (c.properties?.itemTemplate?.onClick) {
          delete c.properties.itemTemplate.onClick;
          console.log(`[SystemAutoWiring] Removed illegal itemTemplate.onClick from ${c.id}`);
      }

      if (c.type === "select" || c.type === "dropdown") {
          const props = (c.properties = c.properties || {});

          // Respect the Select contract: do not auto-bind a controlled key if the component
          // is already using the stateUpdate pattern on its events.
          let hasStateUpdate = false;
          if (Array.isArray(c.events)) {
              for (const e of c.events) {
                  if (e && e.stateUpdate && typeof e.stateUpdate === "object" && Object.keys(e.stateUpdate).length > 0) {
                      hasStateUpdate = true;
                      break;
                  }
              }
          }

          if (!hasStateUpdate && !props.bindKey) {
              const key = `filters.${c.id.replace(/^select_|^dropdown_/, "")}`;
              props.bindKey = key;
              mutation.stateAdded = mutation.stateAdded || {};
              if (!mutation.stateAdded[key]) mutation.stateAdded[key] = SELECT_ALL_VALUE;
              console.log(`[SystemAutoWiring] Auto-bound select ${c.id} to ${key}`);
          }
      }
      
      if (c.properties?.disabledKey && c.properties.disabledKey.startsWith("!")) {
           delete c.properties.disabledKey;
           console.log(`[SystemAutoWiring] Removed illegal disabledKey from ${c.id}`);
      }
  }

  if (!actions.length) return;

  // 2b. CLASSIFY EFFECT-ONLY ACTIONS (Auto-detect)
  for (const a of actions) {
    const id = String(a.id || "").toLowerCase();
    const semantic = String(a.config?.__semantic || "").toLowerCase();
    const isNavigationType = a.type === ACTION_TYPES.NAVIGATION;
    const effectPatterns = [/^open(_in_.+)?/, /navigate/, /launch/, /^redirect/, /open_in_/, /open$/];
    const matchesEffect =
      isNavigationType ||
      effectPatterns.some((re) => re.test(id)) ||
      effectPatterns.some((re) => re.test(semantic));
    if (a.type === ACTION_TYPES.INTEGRATION_CALL && matchesEffect) {
      a.effectOnly = true;
    }
  }

  for (const a of actions) {
      if (a.type === ACTION_TYPES.INTEGRATION_CALL && !a.effectOnly && a.config?.assign && a.config?.ephemeral_internal !== true) {
          const rawKey = a.config.assign;
          const statusKey = `${rawKey}Status`;
          const errorKey = `${rawKey}Error`;

          const normalizedCandidates: string[] = [];
          const addCandidate = (k: string | undefined) => {
              if (k && !normalizedCandidates.includes(k)) normalizedCandidates.push(k);
          };
          addCandidate(rawKey);
          if (rawKey.endsWith("Data") || rawKey.endsWith("Raw")) {
              const base = rawKey.replace(/(Raw|Data)$/, "");
              addCandidate(`${base}Items`);
          }
          if (rawKey.endsWith("List")) {
              const base = rawKey.slice(0, -4);
              addCandidate(`${base}Items`);
          }

          const normalizedKey = normalizedCandidates.find((k) => k !== rawKey) || rawKey;
          const state = mutation.stateAdded || (mutation.stateAdded = {});
          if (!Object.prototype.hasOwnProperty.call(state, normalizedKey)) {
              state[normalizedKey] = [];
          }

          let consumed = false;
          let needsNormalizer = false;
          let needsStatusMirror = false;
          let mirrorTargetLoading: string | undefined;
          let mirrorTargetError: string | undefined;
          
          for (const c of components) {
              if (c.properties?.loadingKey === statusKey || c.properties?.errorKey === errorKey) consumed = true;
              if (c.properties?.loadingKey && c.properties?.errorKey) {
                  const targetLoading = c.properties.loadingKey;
                  const targetError = c.properties.errorKey;
                  const directStatusBinding =
                      targetLoading === statusKey || targetError === errorKey;
                  const looksGeneric =
                      typeof targetLoading === "string" &&
                      typeof targetError === "string" &&
                      targetLoading.endsWith("Status") &&
                      targetError.endsWith("Error");
                  if (!directStatusBinding && looksGeneric) {
                      needsStatusMirror = true;
                      mirrorTargetLoading = targetLoading;
                      mirrorTargetError = targetError;
                      consumed = true;
                  }
              }
              if (c.dataSource?.type === "state" && (c.dataSource.value === statusKey || c.dataSource.value === errorKey)) consumed = true;
              if (c.dataSource?.type === "state" && normalizedCandidates.includes(c.dataSource.value)) {
                  consumed = true;
                  if (c.type && String(c.type).toLowerCase() === "list" && c.dataSource.value === normalizedKey) {
                      needsNormalizer = true;
                  }
              }
              const propsStr = JSON.stringify(c.properties || {});
              for (const key of [statusKey, errorKey, rawKey, normalizedKey]) {
                  if (propsStr.includes(`{{state.${key}}}`)) consumed = true;
              }
          }

          if (!consumed) {
              const hasUi =
                (Array.isArray(components) && components.length > 0) ||
                (Array.isArray(mutation.componentsUpdated) && mutation.componentsUpdated.length > 0);
              if (hasUi) {
                  throw new Error(
                      `Integration action ${a.id} appears to be effect-only. If intentional, mark it as effectOnly: true.`,
                  );
              }
          }

          if (needsStatusMirror && mirrorTargetLoading && mirrorTargetError) {
              const baseId = normalizeActionId(String(a.id || ""));
              const suffix = baseId.startsWith("fetch_") ? baseId.replace(/^fetch_/, "") : baseId;
              const mirrorId = `mirror_status_${suffix}`;
              const existsMirror = actions.some((x: any) => normalizeActionId(String(x.id || "")) === normalizeActionId(mirrorId));
              if (!existsMirror) {
                  const updates: Record<string, any> = {};
                  updates[mirrorTargetLoading] = `{{state.${statusKey}}}`;
                  updates[mirrorTargetError] = `{{state.${errorKey}}}`;
                  const mirror: any = {
                      id: mirrorId,
                      type: ACTION_TYPES.WORKFLOW,
                      config: { __semantic: "status_mirror" },
                      steps: [
                          {
                              type: "state_mutation",
                              config: { updates },
                          },
                      ],
                      triggeredBy: [
                          { type: "state_change", stateKey: statusKey },
                          { type: "state_change", stateKey: errorKey },
                      ],
                  };
                  actions.push(mirror);
                  console.log(
                      `[SystemAutoWiring] Injected status mirror ${mirrorId} for ${a.id} -> ${mirrorTargetLoading}/${mirrorTargetError}`,
                  );
              }
          }

          if (needsNormalizer) {
              const baseId = normalizeActionId(String(a.id || ""));
              const suffix = baseId.startsWith("fetch_") ? baseId.replace(/^fetch_/, "") : baseId;
              const normalizerId = `normalize_${suffix}`;
              const exists = actions.some((x: any) => normalizeActionId(String(x.id || "")) === normalizeActionId(normalizerId));
              if (!exists) {
                  const normalizer: any = {
                      id: normalizerId,
                      type: ACTION_TYPES.INTERNAL,
                      config: {
                          operation: "assign",
                          assign: normalizedKey,
                      },
                      triggeredBy: { type: "state_change", stateKey: rawKey },
                  };
                  actions.push(normalizer);
                  console.log(`[SystemAutoWiring] Injected normalizer ${normalizerId} for ${a.id} -> ${normalizedKey}`);
              }
          }
      }
  }

  const triggeredIds = analyzeActionReachability(mutation, currentSpec);
  
  for (const a of actions) {
      if (a.type === "integration_call" && !triggeredIds.has(normalizeActionId(a.id))) {
           const inputs = a.inputs ?? [];
           if (inputs.length === 1) {
               const inputKey = inputs[0];
               const mutator = actions.find((x: any) => {
                   const m = x.config?.updates ?? x.config?.set ?? x.config?.assign;
                   if (m && typeof m === "object") return Object.keys(m).includes(inputKey);
                   if (x.config?.assign === inputKey) return true;
                   if (Array.isArray(x.steps)) {
                        return x.steps.some((s: any) => {
                             const u = s.config?.updates ?? s.config?.set;
                             return u && Object.keys(u).includes(inputKey);
                        });
                   }
                   return false;
               });
               
               if (mutator) {
                   if (!a.triggeredBy) {
                        a.triggeredBy = { type: "state_change", stateKey: inputKey };
                        console.log(`[SystemAutoWiring] Auto-wired action ${a.id} to trigger on state_change: ${inputKey}`);
                        triggeredIds.add(normalizeActionId(a.id));
                   }
               }
           }
      }
  }

  // 4b. FIX AUTO-WIRED FILTER ACTIONS (ensure internal type and explicit triggers)
  {
    const filterKeys = new Set<string>();
    // Collect filters.* keys from stateAdded
    for (const [k] of Object.entries(mutation.stateAdded ?? {})) {
      if (typeof k === "string" && k.startsWith("filters.")) filterKeys.add(k);
    }
    // Collect bindKey on select/dropdown
    for (const c of components) {
      const bk = c?.properties?.bindKey;
      if (typeof bk === "string" && bk.startsWith("filters.")) filterKeys.add(bk);
    }
    if (filterKeys.size) {
      for (const a of actions) {
        const idStr = String(a.id ?? "");
        const looksLikeFilterUpdater = /filters/.test(idStr) || a.config?.__semantic === "state_update";
        if (!looksLikeFilterUpdater) continue;
        // Normalize type
        const allowed = new Set<ActionType>([
          ACTION_TYPES.INTEGRATION_CALL,
          ACTION_TYPES.INTERNAL,
          ACTION_TYPES.NAVIGATION,
          ACTION_TYPES.WORKFLOW,
        ]);
        if (!allowed.has(a.type as ActionType)) {
          const originalType = a.type;
          a.type = ACTION_TYPES.INTERNAL;
          a.config = { __semantic: "state_update", ...(a.config ?? {}) };
          console.log(`[SystemAutoWiring] Corrected filter action ${a.id} from '${originalType}' to 'internal'`);
        }
        // Ensure explicit state_change triggers for each filter key
        const existing = Array.isArray(a.triggeredBy) ? a.triggeredBy : a.triggeredBy ? [a.triggeredBy] : [];
        const keysAlready = new Set<string>(
          existing.filter((t: any) => t?.type === "state_change" && typeof t.stateKey === "string").map((t: any) => t.stateKey),
        );
        const additions: any[] = [];
        for (const fk of filterKeys) {
          if (!keysAlready.has(fk)) additions.push({ type: "state_change", stateKey: fk });
        }
        if (additions.length) {
          if (!a.triggeredBy) a.triggeredBy = additions.length === 1 ? additions[0] : additions;
          else if (Array.isArray(a.triggeredBy)) a.triggeredBy.push(...additions);
          else a.triggeredBy = [a.triggeredBy, ...additions];
          console.log(`[SystemAutoWiring] Auto-bound ${a.id} to filter state changes: ${Array.from(filterKeys).join(", ")}`);
        }
      }
    }

  for (const a of actions) {
      if (a.type === ACTION_TYPES.INTERNAL) {
          const op = a.config?.operation;
          const semantic = a.config?.__semantic;
          const hasDerivedStep =
              Array.isArray(a.steps) &&
              a.steps.some((s: any) => s && typeof s.type === "string" && s.type === "derive_state");
          const isDerivedOp =
              op === "filter" ||
              op === "map" ||
              op === "derive_state" ||
              op === "derive" ||
              (typeof semantic === "string" && /filter|derive/.test(semantic));
          if (isDerivedOp || hasDerivedStep) {
              const e: any = new Error(
                  `Derived/filter action '${a.id}' cannot be represented as an internal action. Use declarative derived state instead.`,
              );
              e.code = "InvalidIntentGraph";
              e.meta = {
                  type: "InvalidIntentGraph",
                  reason: "DerivedStateAsAction",
                  actionId: a.id,
                  operation: op,
                  semantic,
                  status: "rejected",
              };
              throw e;
          }
      }
  }
  }

  autoAttachComponentEventTriggers(mutation, actions);
  inferSelectionSemantics(mutation, actions);

  // 5. AUTO-WIRE FEEDBACK LOOPS TO COMPONENTS
  // Scan components and wire up loading/error keys if missing
  for (const a of actions) {
      if (a.type === "integration_call" && a.config?.assign) {
          const rawKey = a.config.assign;
          const statusKey = `${rawKey}Status`;
          const errorKey = `${rawKey}Error`;
          
          // Find potential consumers (binding to rawKey or a derived key)
          // We can't easily know derived keys without graph analysis, but we can guess common patterns.
          // Or just look for components that *don't* have loadingKey.
          
          for (const c of components) {
              const bindsToData = 
                  c.dataSource?.value === rawKey || 
                  (c.dataSource?.value && c.dataSource.value.includes(rawKey.replace(/Raw$|Data$/, ""))); // Heuristic match
                  
              if (bindsToData) {
                  c.properties = c.properties || {};
                  if (!c.properties.loadingKey) c.properties.loadingKey = statusKey;
                  if (!c.properties.errorKey) c.properties.errorKey = errorKey;
              }
          }
      }
  }
  
  // 6. ENSURE LIFECYCLE TRIGGERS
  // Ensure hydration actions are triggered
  let firstPageId: string | undefined;
  if (Array.isArray(mutation.pagesAdded) && mutation.pagesAdded.length) {
    firstPageId = (mutation.pagesAdded[0] as any).pageId ?? mutation.pagesAdded[0].id;
  }
  if (!firstPageId && currentSpec && (currentSpec as any).kind === "mini_app") {
    firstPageId = ((currentSpec as any).pages ?? [])[0]?.id;
  }

  const allTriggered = analyzeActionReachability(mutation, currentSpec);
  const orphanActions = actions.filter((a: any) => !allTriggered.has(a.id));

  for (const action of orphanActions) {
    const stateDeps = extractStateDependencies(action);
    if (stateDeps.length > 0) {
      action.triggeredBy = { type: "state_change", stateKey: stateDeps[0] };
      console.log(`[SystemAutoWiring] Auto-bound ${action.id} to state_change(${stateDeps[0]})`);
    } else if (action.type === "integration_call" && firstPageId) {
        // Hydration
        action.triggeredBy = { type: "lifecycle", event: "onPageLoad" };
        mutation.pagesUpdated = mutation.pagesUpdated ?? [];
        mutation.pagesUpdated.push({
            pageId: firstPageId,
            patch: {
                events: [
                    { type: "onPageLoad", actionId: action.id, args: { autoAttached: true, reason: "system_hydration" } }
                ]
            }
        });
        console.log(`[SystemAutoWiring] Auto-bound ${action.id} to onPageLoad`);
    }
  }
  // 7. CONVERT EXPLICIT LIFECYCLE TRIGGERS TO PAGE EVENTS
  // If an action has triggeredBy: { type: "lifecycle", event: "onPageLoad" },
  // we must ensure it is actually wired to the page event.
  if (firstPageId) {
      for (const action of actions) {
          const triggers = Array.isArray(action.triggeredBy) ? action.triggeredBy : (action.triggeredBy ? [action.triggeredBy] : []);
          const lifecycleTrigger = triggers.find((t: any) => t.type === "lifecycle" && t.event === "onPageLoad");
          
          if (lifecycleTrigger) {
              mutation.pagesUpdated = mutation.pagesUpdated ?? [];
              let pageUpdate = mutation.pagesUpdated.find((u: any) => u.pageId === firstPageId);
              if (!pageUpdate) {
                  pageUpdate = { pageId: firstPageId, patch: { events: [] } };
                  mutation.pagesUpdated.push(pageUpdate);
              }
              pageUpdate.patch.events = pageUpdate.patch.events ?? [];
              const alreadyWired = pageUpdate.patch.events.some((e: any) => e.type === "onPageLoad" && normalizeActionId(e.actionId) === normalizeActionId(action.id));
              
              if (!alreadyWired) {
                  pageUpdate.patch.events.push({ 
                      type: "onPageLoad", 
                      actionId: action.id, 
                      args: { autoAttached: true, reason: "lifecycle_trigger" } 
                  });
                  console.log(`[SystemAutoWiring] Converted explicit lifecycle trigger for ${action.id} to onPageLoad event on ${firstPageId}`);
              }
          }
      }
  }

  ensureEveryActionHasTrigger(mutation);
}

function applyContainerPatchesToNewComponents(mutation: any) {
  const updates = Array.isArray(mutation.containerPropsUpdated) ? mutation.containerPropsUpdated : [];
  if (!updates.length) return;

  const remaining: any[] = [];
  const components = mutation.componentsAdded ?? [];
  const pages = mutation.pagesAdded ?? [];

  const byId = new Map<string, any>();
  for (const c of components) {
    if (c && typeof c.id === "string") {
      byId.set(c.id, c);
    }
  }

  const applyPatchToTree = (node: any, targetId: string, patch: any): boolean => {
    if (!node || typeof node !== "object") return false;
    if (node.id === targetId) {
      node.properties = { ...(node.properties || {}), ...(patch || {}) };
      return true;
    }
    if (Array.isArray(node.children)) {
      for (const ch of node.children) {
        if (applyPatchToTree(ch, targetId, patch)) return true;
      }
    }
    return false;
  };

  for (const upd of updates) {
    if (!upd) continue;
    const id = typeof upd.id === "string" ? upd.id : undefined;
    const patch = upd.propertiesPatch || {};
    if (!id) {
      remaining.push(upd);
      continue;
    }
    let inlined = false;
    const direct = byId.get(id);
    if (direct) {
      direct.properties = { ...(direct.properties || {}), ...(patch) };
      inlined = true;
    } else {
      for (const p of pages) {
        if (!p || !Array.isArray(p.components)) continue;
        for (const root of p.components) {
          if (applyPatchToTree(root, id, patch)) {
            inlined = true;
            break;
          }
        }
        if (inlined) break;
      }
    }
    if (!inlined) {
      remaining.push(upd);
    }
  }

  if (remaining.length) {
    mutation.containerPropsUpdated = remaining;
  } else {
    delete mutation.containerPropsUpdated;
  }
}

function ensureEveryActionHasTrigger(mutation: any) {
  const actions = mutation.actionsAdded ?? [];
  let firstPageId: string | undefined;
  if (Array.isArray(mutation.pagesAdded) && mutation.pagesAdded.length) {
    firstPageId = (mutation.pagesAdded[0] as any).pageId ?? mutation.pagesAdded[0].id;
  }

  for (const action of actions) {
       const hasTriggers = !!action.triggeredBy &&
          (!Array.isArray(action.triggeredBy) || (Array.isArray(action.triggeredBy) && action.triggeredBy.length > 0));

       if (!hasTriggers) {
           if (firstPageId) {
               action.triggeredBy = { type: "lifecycle", event: "onPageLoad" };
               mutation.pagesUpdated = mutation.pagesUpdated ?? [];
               let pageUpdate = mutation.pagesUpdated.find((u: any) => u.pageId === firstPageId);
               if (!pageUpdate) {
                   pageUpdate = { pageId: firstPageId, patch: { events: [] } };
                   mutation.pagesUpdated.push(pageUpdate);
               }
               pageUpdate.patch.events = pageUpdate.patch.events ?? [];
               pageUpdate.patch.events.push({ 
                   type: "onPageLoad", 
                   actionId: action.id, 
                   args: { autoAttached: true, reason: "orphan_rescue" } 
               });
               console.log(`[SystemAutoWiring] Rescued orphan action ${action.id} by binding to onPageLoad of ${firstPageId}`);
           } else {
               // Final safety net: Just bind to internal/manual to satisfy Strict Mode
               action.triggeredBy = { type: "internal", reason: "system_safety_net" };
               console.warn(`[SystemSafetyNet] Action ${action.id} had no trigger. Auto-bound to internal(system_safety_net) to prevent crash.`);
           }
       }
  }
}

function autoAttachComponentEventTriggers(mutation: any, actions: any[]) {
  const components = mutation.componentsAdded ?? [];
  const findAction = (rawId: string) => {
    const id = normalizeActionId(rawId);
    return actions.find((a: any) => normalizeActionId(a.id) === id);
  };
  for (const c of components) {
    if (!Array.isArray(c.events)) continue;
    for (const e of c.events) {
      if (!e || !e.actionId) continue;
      const action = findAction(e.actionId);
      if (!action) continue;
      const hasTriggers =
        !!action.triggeredBy &&
        (!Array.isArray(action.triggeredBy) || (Array.isArray(action.triggeredBy) && action.triggeredBy.length > 0));
      if (hasTriggers) continue;
      const eventType = typeof e.type === "string" ? normalizeComponentEventType(c.type, e.type) : e.type;
      const trigger = { type: "component_event", componentId: c.id, event: eventType };
      if (!action.triggeredBy) {
        action.triggeredBy = trigger;
      } else if (Array.isArray(action.triggeredBy)) {
        action.triggeredBy.push(trigger);
      } else {
        action.triggeredBy = [action.triggeredBy, trigger];
      }
    }
  }
}

function inferSelectionSemantics(mutation: any, actions: any[]) {
  const components = mutation.componentsAdded ?? [];
  const listComponents = components.filter(
    (c: any) => c && typeof c.type === "string" && c.type.toLowerCase() === "list",
  );
  if (!listComponents.length) return;
  const targetList = listComponents[listComponents.length - 1];
  targetList.events = targetList.events ?? [];
  for (const action of actions) {
    if (!action || !action.id) continue;
    const hasTriggers =
      !!action.triggeredBy &&
      (!Array.isArray(action.triggeredBy) || (Array.isArray(action.triggeredBy) && action.triggeredBy.length > 0));
    if (hasTriggers) continue;
    const normalizedId = normalizeActionId(action.id);
    const patternMatch =
      normalizedId.startsWith("select_") || normalizedId.startsWith("open_") || normalizedId.startsWith("view_");
    if (!patternMatch) continue;
    const canonicalEvent = normalizeComponentEventType(targetList.type, "onSelect");
    const alreadyWired =
      Array.isArray(targetList.events) &&
      targetList.events.some(
        (e: any) => e && normalizeActionId(e.actionId) === normalizedId,
      );
    if (!alreadyWired) {
      targetList.events.push({ type: canonicalEvent, actionId: action.id });
    }
    const trigger = { type: "component_event", componentId: targetList.id, event: canonicalEvent };
    if (!action.triggeredBy) {
      action.triggeredBy = trigger;
    } else if (Array.isArray(action.triggeredBy)) {
      action.triggeredBy.push(trigger);
    } else {
      action.triggeredBy = [action.triggeredBy, trigger];
    }
  }
}

function tryAttachComponentTriggerFromSemantics(mutation: any, action: any): boolean {
  const hasTriggers =
    !!action.triggeredBy &&
    (!Array.isArray(action.triggeredBy) || (Array.isArray(action.triggeredBy) && action.triggeredBy.length > 0));
  if (hasTriggers) return true;
  inferSelectionSemantics(mutation, [action]);
  autoAttachComponentEventTriggers(mutation, [action]);
  const after =
    !!action.triggeredBy &&
    (!Array.isArray(action.triggeredBy) || (Array.isArray(action.triggeredBy) && action.triggeredBy.length > 0));
  return after;
}

function hoistInlineEventActions(mutation: any) {
  if (!mutation) return;
  const actions = Array.isArray(mutation.actionsAdded) ? mutation.actionsAdded : (mutation.actionsAdded = []);
  const existingIds = new Set<string>();
  for (const a of actions) {
    if (a && a.id) existingIds.add(normalizeActionId(a.id));
  }
  const ensureActionFromInline = (componentId: string | undefined, eventType: string | undefined, inline: any) => {
    let candidateId: string | undefined = inline && typeof inline.id === "string" && inline.id.length ? inline.id : undefined;
    const comp = componentId ? String(componentId) : "";
    const compLower = comp.toLowerCase();
    const evt = eventType || "";
    if (!candidateId && comp) {
      if (compLower.includes("tool") && evt === "onChange") {
        candidateId = "set_tool_filter";
      } else if ((compLower.includes("activitytype") || compLower.includes("activity_type")) && evt === "onChange") {
        candidateId = "set_activity_type_filter";
      } else if ((compLower.includes("timerange") || compLower.includes("time_range") || compLower.includes("time")) && evt === "onChange") {
        candidateId = "set_time_range_filter";
      } else if (
        compLower.includes("activity") &&
        (evt === "onItemClick" || evt === "onSelect" || evt === "onRowClick")
      ) {
        candidateId = "select_activity";
      }
    }
    if (!candidateId) {
      const base = comp ? `${comp}_${evt || "event"}` : evt || "event";
      candidateId = normalizeActionId(base || "inline_event");
    }
    const normalized = normalizeActionId(candidateId);
    let existing = actions.find((a: any) => a && normalizeActionId(a.id) === normalized);
    if (!existing) {
      const action: any = {
        id: candidateId,
        type: inline && inline.type ? inline.type : ACTION_TYPES.INTERNAL,
        config: inline && inline.config ? inline.config : inline || {},
      };
      actions.push(action);
      existingIds.add(normalized);
      existing = action;
    }
    return existing.id;
  };
  const convertEvents = (node: any, componentId?: string) => {
    if (!node || !Array.isArray(node.events)) return;
    for (const e of node.events) {
      if (!e || e.actionId || !e.action) continue;
      const inline = e.action;
      const actionId = ensureActionFromInline(componentId, e.type, inline);
      e.actionId = actionId;
      delete e.action;
    }
  };
  if (Array.isArray(mutation.componentsAdded)) {
    for (const c of mutation.componentsAdded) {
      if (!c) continue;
      convertEvents(c, c.id);
    }
  }
  if (Array.isArray(mutation.pagesAdded)) {
    for (const p of mutation.pagesAdded) {
      if (!p) continue;
      convertEvents(p);
    }
  }
  if (Array.isArray(mutation.pagesUpdated)) {
    for (const u of mutation.pagesUpdated) {
      if (!u || !u.patch) continue;
      convertEvents(u.patch);
    }
  }
}

function canonicalizeStateKeys(mutation: any) {
  if (!mutation || !mutation.stateAdded || typeof mutation.stateAdded !== "object") return;
  const state = mutation.stateAdded as Record<string, any>;
  const renames: Record<string, string> = {};

  for (const key of Object.keys(state)) {
    let canonical: string | null = null;

    if (key === "filter_tool" || key === "tool_filter" || key === "activityToolFilter") {
      canonical = "filters.tool";
    } else if (key === "activityTypeFilter" || key === "filter_type" || key === "type_filter") {
      canonical = "filters.activityType";
    } else if (key === "filter_time" || key === "time_filter" || key === "timeRange") {
      canonical = "filters.timeRange";
    }

    if (canonical && canonical !== key) {
      if (!(canonical in state)) {
        state[canonical] = state[key];
      }
      delete state[key];

      if (state[canonical] === "" || state[canonical] === null || state[canonical] === undefined) {
        state[canonical] = SELECT_ALL_VALUE;
      }

      renames[key] = canonical;
    }
  }

  if (Object.keys(renames).length > 0) {
    console.log(`[SystemHardening] Canonicalizing filter keys:`, renames);
  }
}

export function sanitizeIntegrationsForIntent(intent: CompiledIntent, allowedCapabilityIds: Set<string>) {
  const mutation = intent.tool_mutation as any;
  if (!mutation || !Array.isArray(mutation.actionsAdded)) return;
  for (const action of mutation.actionsAdded) {
    if (!action || action.type !== "integration_call") continue;
    const cfg = action.config || {};
    const capId = typeof cfg.capabilityId === "string" ? cfg.capabilityId : "";
    if (!capId || !allowedCapabilityIds.has(capId)) {
      action.type = "internal";
      action.config = { ...cfg, ephemeral_internal: true };
      if (action.config.capabilityId) {
        delete action.config.capabilityId;
      }
    }
  }
}

export function validateUIReferences(intent: CompiledIntent, currentSpec?: ToolSpec) {
  const mutation = intent.tool_mutation;
  if (!mutation) return;

  const allActionIds = new Set<string>();
  
  // Collect all valid action IDs (existing + added)
  if (currentSpec && (currentSpec as any).actions) {
      (currentSpec as any).actions.forEach((a: any) => allActionIds.add(normalizeActionId(a.id)));
  }
  if (mutation.actionsAdded) {
      mutation.actionsAdded.forEach((a: any) => allActionIds.add(normalizeActionId(a.id)));
  }

  // Helper to validate a node's events
  const validateNode = (node: any, context: string) => {
      if (node.events) {
          for (const e of node.events) {
              if (e.actionId) {
                  const aid = normalizeActionId(e.actionId);
                  if (!allActionIds.has(aid)) {
                      throw new Error(`[Compiler Error] UI Component '${context}' references missing action '${e.actionId}'. Action must exist.`);
                  }
              }
          }
      }
      if (node.children) {
          for (const ch of node.children) validateNode(ch, `Child of ${context}`);
      }
  };

  // Validate Pages Added
  if (mutation.pagesAdded) {
      for (const p of mutation.pagesAdded) {
          validateNode(p, `Page(${p.id || p.name})`);
          if (p.components) {
              for (const c of p.components) validateNode(c, `Component(${c.id || c.type})`);
          }
      }
  }

  // Validate Components Added
  if (mutation.componentsAdded) {
      for (const c of mutation.componentsAdded) validateNode(c, `Component(${c.id || c.type})`);
  }

  // Validate Updates (Patches)
  if (mutation.componentsUpdated) {
      for (const u of mutation.componentsUpdated) {
           if (u.patch) validateNode(u.patch, `Update(${u.componentRef || u.id})`);
      }
  }
  
  if (mutation.pagesUpdated) {
      for (const u of mutation.pagesUpdated) {
          if (u.patch) validateNode(u.patch, `Update(${u.pageId || u.id})`);
      }
  }
}
