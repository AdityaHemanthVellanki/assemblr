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

const versioningService = new VersioningService();

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
    
    const intent = await compileIntent(
      input.userMessage,
      input.messages,
      input.connectedIntegrationIds,
      schemas,
      metrics,
      input.mode,
      input.policies || [] // Pass policies
    );

    tracer.setIntent(intent);
    console.log("[Orchestrator] Compiled Intent:", JSON.stringify(intent, null, 2));

    // 2. Dispatch & Execute
    const executionResults: any[] = [];

    if (intent.intent_type === "chat" || intent.intent_type === "execute") {
      if (intent.execution_graph && intent.execution_graph.nodes.length > 0) {
        for (const node of intent.execution_graph.nodes) {
          if (node.type !== "integration_call" || !node.capabilityId) continue;

          // Resolve Runtime
          const integrationId = node.capabilityId.split("_")[0]; 
          const runtime = RUNTIMES[integrationId];
          
          if (!runtime) {
            console.warn(`No runtime for integration: ${integrationId}`);
            continue;
          }

          const agentStart = Date.now();
          
          try {
            const token = await getValidAccessToken(input.orgId, integrationId);
            // Context Resolution
            const context = await runtime.resolveContext(token);
            const capability = runtime.capabilities[node.capabilityId];
            
            if (!capability) {
               throw new Error(`Capability ${node.capabilityId} not found in runtime ${integrationId}`);
            }

            // Enforce Permissions
            if (runtime.checkPermissions) {
                runtime.checkPermissions(node.capabilityId, DEV_PERMISSIONS);
            }

            // Execute with Trace
            const result = await capability.execute(node.params, context, tracer);
            executionResults.push({ task: node, result });
            
            tracer.logAgentExecution({
                agentId: integrationId, // Mapping Integration to Agent ID for now
                task: node.capabilityId,
                input: node.params,
                output: "Success (Data Omitted)",
                duration_ms: Date.now() - agentStart
            });

          } catch (e) {
            console.error(`Task ${node.id} failed:`, e);
            tracer.logAgentExecution({
                agentId: integrationId,
                task: node.capabilityId ?? "unknown",
                input: node.params,
                output: "Error",
                duration_ms: Date.now() - agentStart
            });
            throw e; // Bubble up to global catcher
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
        try {
            updatedSpec = materializeSpec(input.currentSpec, mutation);
            (updatedSpec as any).kind = "mini_app"; // Enforce Kind

            const currentMiniApp = input.currentSpec as unknown as Partial<MiniAppSpec>;
            const updatedMiniApp = updatedSpec as MiniAppSpec;

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

        // VERSIONING: Create Draft instead of just returning spec
        const userId = "user_placeholder"; // TODO: Pass userId in input
        
        await versioningService.createDraft(input.toolId, updatedSpec, userId, intent);
        
        tracer.finish("success");
        return {
            explanation: tracer.generateExplanation(),
            message: { type: "text", content: "I've created a new draft version of your app." },
            spec: updatedSpec, // Return for immediate preview
            metadata: { 
                persist: false, // Don't overwrite project.spec directly in legacy way
                trace: tracer.getTrace(),
            }
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
