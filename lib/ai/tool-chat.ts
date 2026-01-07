import "server-only";

import { randomUUID } from "crypto";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { dashboardSpecSchema, type DashboardSpec } from "@/lib/spec/dashboardSpec";
import { compileIntent } from "./planner";
import { getValidAccessToken } from "@/lib/integrations/tokenRefresh";
import { GitHubRuntime } from "@/lib/integrations/runtimes/github";
import { IntegrationRuntime } from "@/lib/core/runtime";
import { getDiscoveredSchemas } from "@/lib/schema/store";
import { findMetrics } from "@/lib/metrics/store";
import { ExecutionTracer } from "@/lib/observability/tracer";
import { ExecutionError } from "@/lib/core/errors";

// Runtime Registry
const RUNTIMES: Record<string, IntegrationRuntime> = {
  github: new GitHubRuntime(),
  // Add others as they are refactored
};

export type ToolChatResponse = {
  explanation: string;
  message: { type: "text"; content: string };
  spec: DashboardSpec;
  metadata?: any;
};

export async function processToolChat(input: {
  orgId: string;
  currentSpec: DashboardSpec;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  userMessage: string;
  connectedIntegrationIds: string[];
  mode: "create" | "chat";
  integrationMode: "auto" | "manual";
  selectedIntegrationIds?: string[];
}): Promise<ToolChatResponse> {
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
      input.mode
    );

    tracer.setIntent(intent);
    console.log("[Orchestrator] Compiled Intent:", JSON.stringify(intent, null, 2));

    // 2. Dispatch & Execute
    let executionResults: any[] = [];

    if (intent.intent_type === "chat" || intent.intent_type === "analyze") {
      if (intent.tasks && intent.tasks.length > 0) {
        for (const task of intent.tasks) {
          // Resolve Runtime
          const integrationId = task.capabilityId.split("_")[0]; 
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
            const capability = runtime.capabilities[task.capabilityId];
            
            if (!capability) {
               throw new Error(`Capability ${task.capabilityId} not found in runtime ${integrationId}`);
            }

            // Execute with Trace
            const result = await capability.execute(task.params, context, tracer);
            executionResults.push({ task, result });
            
            tracer.logAgentExecution({
                agentId: integrationId, // Mapping Integration to Agent ID for now
                task: task.capabilityId,
                input: task.params,
                output: "Success (Data Omitted)",
                duration_ms: Date.now() - agentStart
            });

          } catch (e) {
            console.error(`Task ${task.id} failed:`, e);
            tracer.logAgentExecution({
                agentId: integrationId,
                task: task.capabilityId,
                input: task.params,
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
        if (intent.intent_type !== "create" && intent.intent_type !== "modify") {
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

        // Apply Mutation to Spec
        let updatedSpec = { ...input.currentSpec };
        updatedSpec.kind = "mini_app"; // Enforce Kind

        if (mutation.pagesAdded) {
            updatedSpec.pages = [...(updatedSpec.pages || []), ...mutation.pagesAdded];
            mutation.pagesAdded.forEach(p => tracer.logUIMutation({ componentId: p.id, changeType: "added", details: p }));
        }
        // If components added without page, add to first page
        if (mutation.componentsAdded && mutation.componentsAdded.length > 0) {
            if (!updatedSpec.pages || updatedSpec.pages.length === 0) {
                updatedSpec.pages = [{ id: "page_home", name: "Home", components: [], layoutMode: "grid", state: {} }];
            }
            updatedSpec.pages[0].components = [...updatedSpec.pages[0].components, ...mutation.componentsAdded];
            mutation.componentsAdded.forEach(c => tracer.logUIMutation({ componentId: c.id, changeType: "added", details: c }));
        }
        if (mutation.actionsAdded) {
            updatedSpec.actions = [...(updatedSpec.actions || []), ...mutation.actionsAdded];
        }
        if (mutation.stateAdded) {
            updatedSpec.state = { ...(updatedSpec.state || {}), ...mutation.stateAdded };
            Object.keys(mutation.stateAdded).forEach(k => tracer.logStateMutation({ key: k, oldValue: undefined, newValue: mutation.stateAdded![k] }));
        }

        // Verify Contract
        const hasUI = updatedSpec.pages?.some(p => p.components.length > 0);
        if (!hasUI) {
            tracer.finish("failure", "No UI components generated");
            return {
                explanation: "I failed to generate a visible user interface. Please try again.",
                message: { type: "text", content: "I failed to generate a visible user interface. Please try again." },
                spec: input.currentSpec,
                metadata: { trace: tracer.getTrace() }
            };
        }

        tracer.finish("success");
        return {
            explanation: tracer.generateExplanation(),
            message: { type: "text", content: "I've built your mini app." },
            spec: updatedSpec,
            metadata: { persist: true, trace: tracer.getTrace() }
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
