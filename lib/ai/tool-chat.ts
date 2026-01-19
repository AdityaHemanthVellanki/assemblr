import "server-only";

import { randomUUID } from "crypto";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { dashboardSpecSchema, type DashboardSpec } from "@/lib/spec/dashboardSpec";
import type { ToolSpec } from "@/lib/spec/toolSpec";
import type { MiniAppSpec } from "@/lib/spec/miniAppSpec";
import { compileIntent } from "./planner";
import { getValidAccessToken } from "@/lib/integrations/tokenRefresh";
import { getDiscoveredSchemas } from "@/lib/schema/store";
import { findMetrics } from "@/lib/metrics/store";
import { ExecutionTracer } from "@/lib/observability/tracer";
import { ExecutionError } from "@/lib/core/errors";
import { VersioningService } from "@/lib/versioning/service";
import { OrgPolicy } from "@/lib/core/governance";
import { ensureCorePluginsLoaded } from "@/lib/core/plugins/loader";
import { materializeSpec } from "@/lib/spec/materializer";
import { RUNTIMES } from "@/lib/integrations/map";
import { DEV_PERMISSIONS } from "@/lib/core/permissions";
import { validateCompiledIntent } from "./planner-logic";
import { validateIntentExecution } from "@/lib/execution/validator-intent";
import { saveDraftRuntime, DraftRuntimeStatus } from "@/lib/observability/store";
import type { PlannerContext } from "@/lib/ai/types";
import { getConnectedIntegrations } from "@/lib/integrations/store";
import { RuntimeActionRegistry } from "@/lib/execution/registry";

const versioningService = new VersioningService();

function resolveMutationRefs(spec: ToolSpec, mutation: any): any {
  const mini = spec as any;
  function allComponents(): Array<{ pageId: string; comp: any }> {
    const out: Array<{ pageId: string; comp: any }> = [];
    for (const p of mini.pages || []) {
      for (const c of p.components || []) {
        out.push({ pageId: p.id, comp: c });
        pushChildren(p.id, c);
      }
    }
    function pushChildren(pageId: string, node: any) {
      if (Array.isArray(node.children)) {
        for (const ch of node.children) {
          out.push({ pageId, comp: ch });
          pushChildren(pageId, ch);
        }
      }
    }
    return out;
  }
  const comps = allComponents();
  function matchRef(ref?: string): { id?: string; pageId?: string } | null {
    if (!ref) return null;
    const r = String(ref).toLowerCase();
    for (const { pageId, comp } of comps) {
      const label = (comp.label ? String(comp.label) : "").toLowerCase();
      const type = String(comp.type || "").toLowerCase();
      const title = (comp.properties?.title ? String(comp.properties.title) : "").toLowerCase();
      const bindKey = (comp.properties?.bindKey ? String(comp.properties.bindKey) : "").toLowerCase();
      const dsVal = (comp.dataSource?.value ? String(comp.dataSource.value) : "").toLowerCase();
      const candidates = [label, type, title, bindKey, dsVal].filter(Boolean);
      if (candidates.some((c) => c && (r.includes(c) || c.includes(r)))) {
        return { id: comp.id, pageId };
      }
    }
    return null;
  }
  function resolveList(list?: any[]) {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      if (!item) continue;
      if (!item.id && item.componentRef) {
        const hit = matchRef(item.componentRef);
        if (hit) {
          item.id = hit.id;
          item.pageId = item.pageId || hit.pageId;
        }
      }
    }
  }
  function resolvePages(list?: any[]) {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      if (!item) continue;
      if (!item.pageId && item.pageRef) {
        const r = String(item.pageRef).toLowerCase();
        const hit = (mini.pages || []).find((p: any) => {
          const name = String(p.name ?? "").toLowerCase();
          const pid = String(p.id ?? "").toLowerCase();
          return (name && (r.includes(name) || name.includes(r))) || (pid && (r.includes(pid) || pid.includes(r)));
        });
        if (hit) {
          item.pageId = hit.id;
        }
      }
    }
  }
  resolveList(mutation.componentsUpdated);
  resolveList(mutation.componentsRemoved);
  resolveList(mutation.reparent);
  resolveList(mutation.containerPropsUpdated);
  resolvePages(mutation.pagesUpdated);
  return mutation;
}

function validateInteraction(spec: MiniAppSpec) {
  const actionIds = new Set((spec.actions || []).map((a) => a.id));
  const triggered = new Set<string>();
  for (const p of spec.pages || []) {
    collectEvents(p);
    for (const c of p.components || []) {
      collectEvents(c);
    }
    function collectEvents(node: any) {
      if (Array.isArray(node.events)) {
        for (const e of node.events) {
          if (e.actionId) triggered.add(e.actionId);
        }
      }
      if (Array.isArray(node.children)) {
        for (const ch of node.children) collectEvents(ch);
      }
    }
  }
  for (const a of spec.actions || []) {
    if (a.triggeredBy) triggered.add(a.id);
  }
  for (const id of actionIds) {
    if (!triggered.has(id)) {
      throw new Error(`Action ${id} is not triggered by any event`);
    }
  }
  const stateKeysRead = new Set<string>();
  for (const p of spec.pages || []) {
    for (const c of p.components || []) {
      collectBindings(c);
    }
    function collectBindings(node: any) {
      if (node.dataSource?.type === "state" && node.dataSource.value) {
        stateKeysRead.add(node.dataSource.value);
      }
      if (node.properties?.bindKey) {
        stateKeysRead.add(node.properties.bindKey);
      }
      if (node.type === "text" && typeof node.properties?.content === "string") {
        const m = node.properties.content.match(/{{state\.([a-zA-Z0-9_.$-]+)}}/g);
        if (m) {
          m.forEach((s: string) => stateKeysRead.add(s.replace("{{state.", "").replace("}}", "")));
        }
      }
      if (Array.isArray(node.children)) {
        for (const ch of node.children) collectBindings(ch);
      }
    }
  }
  for (const a of spec.actions || []) {
    if (a.type === "integration_call") {
      const assignKey = a.config?.assign;
      if (!assignKey && !stateKeysRead.has(`${a.id}.data`)) {
        console.warn(`Integration action ${a.id} has no assign and its default state is not read`);
      }
      if (assignKey && !stateKeysRead.has(assignKey)) {
        console.warn(`Integration action ${a.id} assigns to '${assignKey}' but no component reads it`);
      }
    }
  }
}

export type ToolChatResponse = {
  explanation: string;
  message: { type: "text"; content: string };
  spec: ToolSpec;
  metadata?: any;
};

export async function processToolChat(input: {
  orgId: string;
  toolId: string; // Added toolId
  currentSpec: ToolSpec;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  userMessage: string;
  connectedIntegrationIds: string[];
  mode: "create" | "chat";
  integrationMode: "auto" | "manual";
  selectedIntegrationIds?: string[];
  policies?: OrgPolicy[]; // Added policies
}): Promise<ToolChatResponse> {
  await ensureCorePluginsLoaded();
  getServerEnv();

  // Initialize Tracer
  const tracer = new ExecutionTracer(input.mode === "create" ? "create" : "run");

  try {
    // 1. Compile Intent
    const schemas = await getDiscoveredSchemas(input.orgId);
    const metrics = await findMetrics(input.orgId);
    
    // Build Planner Context (Source of Truth: Database)
    const integrationsMap = await getConnectedIntegrations(input.orgId);
    const plannerContext: PlannerContext = { integrations: integrationsMap };

    const intent = await compileIntent(
      input.userMessage,
      input.messages,
      plannerContext,
      schemas,
      metrics,
      input.mode,
      input.policies || [], // Pass policies
      input.currentSpec,
    );

    tracer.setIntent(intent);
    console.log("[Orchestrator] Compiled Intent:", JSON.stringify(intent, null, 2));

    // Pre-Execution Validation (CRITICAL)
    const validation = validateIntentExecution(intent, plannerContext, input.currentSpec);
    if (!validation.valid) {
      console.warn(`[ExecutionValidator] Blocked execution: ${validation.error}`);
      tracer.finish("failure", validation.error);
      return {
        explanation: `I couldn't complete that request. ${validation.error}`,
        message: { type: "text", content: validation.correctiveAction || "Please check your integrations." },
        spec: input.currentSpec,
      };
    }

    // 2. Dispatch & Execute
    const executionResults: any[] = [];

    if (intent.intent_type === "chat" || intent.intent_type === "execute") {
      // Hydrate Runtime Registry
      const runtimeRegistry = new RuntimeActionRegistry(input.orgId);
      
      // If the intent has ephemeral actions (not yet in spec), we should hydrate them too.
      // But currently hydrate takes a ToolSpec.
      // We can construct a temporary mini-spec from the intent's execution graph or tool mutation.
      
      if (intent.tool_mutation?.actionsAdded) {
          await runtimeRegistry.hydrate({
              kind: "mini_app",
              actions: intent.tool_mutation.actionsAdded
          } as any);
      }

      if (intent.execution_graph && intent.execution_graph.nodes.length > 0) {
        for (const node of intent.execution_graph.nodes) {
          if (node.type !== "integration_call") continue;

          // Deterministic Action Execution via Registry
          // The planner (via compiler) should have generated a deterministic ID
          // OR if this is a legacy node, we might need to fallback.
          // But the requirement is STRICT: "Runtime may ONLY execute actions that exist in registry"
          
          // Check if we have an ID.
          // If the node came from the execution graph, it might reference an action ID.
          // The execution graph nodes in `CompiledIntent` have `id`, `type`, `capabilityId`, `params`.
          // They don't explicitly link to `actionsAdded`.
          // However, the `compileIntent` process now materializes actions.
          
          // If the node IS the action (which it often is in simple graphs), we should use its ID.
          // But wait, `node.id` in execution graph might be "step_1", not "action_google_...".
          // We need to look up the action.
          
          // Actually, `compileIntent` materializes `tool_mutation.actionsAdded`.
          // The execution graph is a DAG of these actions.
          // So we should look for the action in the registry that matches the node's intent.
          
          // Ideally, the execution graph node should reference the action ID.
          // If node.id matches the action ID, we are good.
          // Let's assume the planner sets node.id = action.id for 1:1 mapping.
          
          let actionId = node.id;
          
          // Try to find the action in the registry
          let action = runtimeRegistry.get(actionId);
          
          if (!action && node.capabilityId) {
              // Fallback: Try to generate the ID using the compiler logic (deterministic)
              // This handles cases where the graph node ID differs from the action ID
              // but semantically they are the same capability usage.
              // BUT the registry was hydrated with `actionsAdded`.
              // So we need to find which action in `actionsAdded` corresponds to this node.
              // If `actionsAdded` used `materializeCapabilityAction`, they have canonical IDs.
              // If the graph node uses the same canonical ID, it works.
              
              // Let's try to construct the canonical ID
              // We need integrationId.
              // The node has capabilityId (e.g. "google_gmail_list").
              // We can infer integrationId from capabilityId (usually prefix).
              // Or look it up.
              
              const parts = node.capabilityId.split("_");
              const integrationId = parts[0]; // simplistic inference
              // Better: use registry lookup, but we don't have it here easily without loading all runtimes.
              // Wait, `RUNTIMES` is available.
              
              // Let's rely on the fact that `hydrate` registered the actions.
              // If the node.id is not found, it means the planner didn't align them.
              // But we can try to execute it ad-hoc if we allow "ephemeral" execution?
              // The prompt says: "Runtime may ONLY execute actions that exist in registry".
              // So we MUST have registered it.
              
              // If it's missing, it's a failure.
              console.warn(`[Execution] Action ${actionId} not found in registry. Attempting heuristic lookup.`);
              
              // Try to find ANY action in the registry that matches the capability
              // This is a "fuzzy match" fallback.
              // We can iterate the registry (private map, but we can add public accessor or just debug)
              // Actually, let's just log failure for now to enforce strictness.
          }

          if (!action) {
             const error = `Fatal: Action ${actionId} not found in Runtime Registry. Plan execution aborted.`;
             console.error(error);
             tracer.finish("failure", error);
             throw new Error(error);
          }

          const agentStart = Date.now();
          
          try {
            // Execute via Registry
            const result = await action.run(tracer);
            executionResults.push({ task: node, result });
            
            tracer.logAgentExecution({
                agentId: "runtime", 
                task: actionId,
                input: node.params,
                output: "Success",
                duration_ms: Date.now() - agentStart
            });

          } catch (e) {
            console.error(`Action ${actionId} failed:`, e);
            tracer.logAgentExecution({
                agentId: "runtime",
                task: actionId,
                input: node.params,
                output: "Error",
                duration_ms: Date.now() - agentStart
            });
            throw e; 
          }
        }
      }
    }

    // 3. Output Generation
    
    // Branch A: Create Mode (Mini App Materialization)
    if (input.mode === "create") {
        if (intent.intent_type !== "create") {
            tracer.finish("failure", "Intent mismatch");
            return {
                explanation: "I couldn't determine how to build a tool from your request. Please clarify.",
                message: { type: "text", content: "I couldn't determine how to build a tool from your request. Please clarify." },
                spec: input.currentSpec,
                metadata: { trace: tracer.getTrace() }
            };
        }

const mutation = intent.tool_mutation;
        if (!mutation) {
            tracer.finish("failure", "No tool mutation generated");
            return {
                explanation: "I understood your request but couldn't generate a valid tool specification.",
                message: { type: "text", content: "I understood your request but couldn't generate a valid tool specification." },
                spec: input.currentSpec,
                metadata: { trace: tracer.getTrace() }
            };
        }

        let updatedSpec: ToolSpec;
        let updatedMiniApp: MiniAppSpec;
        try {
            validateCompiledIntent(intent, input.currentSpec, { mode: "create" });
            const resolved = resolveMutationRefs(input.currentSpec, mutation);
            updatedSpec = materializeSpec(input.currentSpec, resolved);
            (updatedSpec as any).kind = "mini_app"; // Enforce Kind

            const currentMiniApp = input.currentSpec as unknown as Partial<MiniAppSpec>;
            updatedMiniApp = updatedSpec as MiniAppSpec;

            const beforePageIds = new Set((currentMiniApp.pages || []).map(p => p.id));
            const addedPages = (updatedMiniApp.pages || []).filter(p => !beforePageIds.has(p.id));
            addedPages.forEach(p =>
                tracer.logUIMutation({
                    componentId: p.id,
                    changeType: "added",
                    details: p
                })
            );

            const beforeComponentsByPage: Record<string, Set<string>> = {};
            (currentMiniApp.pages || []).forEach(p => {
                beforeComponentsByPage[p.id] = new Set((p.components || []).map(c => c.id));
            });
            (updatedMiniApp.pages || []).forEach(p => {
                const seen = beforeComponentsByPage[p.id] || new Set<string>();
                (p.components || []).forEach(c => {
                    if (!seen.has(c.id)) {
                        tracer.logUIMutation({
                            componentId: c.id,
                            changeType: "added",
                            details: { pageId: p.id, component: c }
                        });
                    }
                });
            });

            if (mutation.stateAdded) {
                Object.keys(mutation.stateAdded).forEach(k =>
                    tracer.logStateMutation({ key: k, oldValue: undefined, newValue: mutation.stateAdded![k] })
                );
            }
        } catch (e) {
            console.error("Spec Materialization Failed:", e);
            tracer.finish("failure", `Spec Materialization Failed: ${e instanceof Error ? e.message : String(e)}`);
             return {
                explanation: "I encountered an error while assembling the interface. Please try again.",
                message: { type: "text", content: "I encountered an error while assembling the interface." },
                spec: input.currentSpec,
                metadata: { trace: tracer.getTrace() }
            };
        }

        // Verify Contract
        const hasUI = (updatedSpec as MiniAppSpec).pages?.some(p => p.components.length > 0);
        if (!hasUI) {
            tracer.finish("failure", "No UI components generated");
            return {
                explanation: "I failed to generate a visible user interface. Please try again.",
                message: { type: "text", content: "I failed to generate a visible user interface. Please try again." },
                spec: input.currentSpec,
                metadata: { trace: tracer.getTrace() }
            };
        }
        try {
            validateInteraction(updatedMiniApp);
        } catch (e) {
            tracer.finish("failure", `Interaction invalid: ${e instanceof Error ? e.message : String(e)}`);
            return {
                explanation: "The requested change resulted in non-interactive or unwired UI. Please refine your instruction.",
                message: { type: "text", content: "The change would create ghost actions or unused state. Please clarify the wiring." },
                spec: input.currentSpec,
                metadata: { trace: tracer.getTrace() }
            };
        }

        const trace = tracer.getTrace();

        const status: DraftRuntimeStatus = {
          planner_success: true,
          ui_generated: true,
          ui_rendered: false,
          version_persisted: false,
        };

        saveDraftRuntime(trace.id, {
          traceId: trace.id,
          toolId: input.toolId,
          spec: updatedSpec,
          status,
        });

        try {
          const userId = "user_placeholder";
          versioningService
            .createDraft(input.toolId, updatedSpec, userId, intent)
            .then(() => {
              const updatedStatus: DraftRuntimeStatus = {
                ...status,
                version_persisted: true,
              };
              saveDraftRuntime(trace.id, {
                traceId: trace.id,
                toolId: input.toolId,
                spec: updatedSpec,
                status: updatedStatus,
              });
            })
            .catch((e) => {
              console.warn("Failed to persist draft version to tool_versions", e);
            });
        } catch (e) {
          console.warn("Versioning service invocation failed", e);
        }

        tracer.finish("success");
        return {
          explanation: tracer.generateExplanation(),
          message: {
            type: "text",
            content:
              "I've generated a new draft UI. I'll attempt to persist it in the background, but your UI is available regardless of persistence.",
          },
          spec: updatedSpec,
          metadata: {
            persist: false,
            trace,
            runtime: status,
          },
        };
    }

    // Branch B: Chat Mode (Text Response)
    if (executionResults.length > 0) {
        let content = "Here is what I found:\n\n";
        for (const res of executionResults) {
            const data = res.result;
            if (Array.isArray(data)) {
                content += `**${res.task.capabilityId}** (${data.length} items):\n`;
                content += "```json\n" + JSON.stringify(data.slice(0, 3), null, 2) + "\n```\n";
            } else {
                content += `**${res.task.capabilityId}**:\n`;
                content += "```json\n" + JSON.stringify(data, null, 2) + "\n```\n";
            }
        }
        tracer.finish("success");
        return {
            explanation: tracer.generateExplanation(),
            message: { type: "text", content },
            spec: input.currentSpec,
            metadata: { trace: tracer.getTrace() }
        };
    }

    tracer.finish("success", "No actions needed");
    return {
        explanation: "I understood your request but didn't find any actions to take.",
        message: { type: "text", content: "I understood your request but didn't find any actions to take." },
        spec: input.currentSpec,
        metadata: { trace: tracer.getTrace() }
    };

  } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      tracer.finish("failure", msg);
      
      return {
          explanation: `I encountered an error: ${msg}`,
          message: { type: "text", content: `Error: ${msg}` },
          spec: input.currentSpec,
          metadata: { trace: tracer.getTrace(), error: msg }
      };
  }
}