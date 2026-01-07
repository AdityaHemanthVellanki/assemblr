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

  console.log("[Orchestrator] Compiled Intent:", JSON.stringify(intent, null, 2));

  // 2. Dispatch & Execute
  let executionResults: any[] = [];
  let executionError: string | undefined;

  if (intent.intent_type === "chat" || intent.intent_type === "analyze") {
    if (intent.tasks && intent.tasks.length > 0) {
      for (const task of intent.tasks) {
        // Resolve Runtime
        // We need to know which integration owns this capability.
        // For now, we iterate runtimes to find it, or use a registry map.
        // Optimization: Capability ID usually prefixed, e.g. "github_commits_list"
        const integrationId = task.capabilityId.split("_")[0]; 
        const runtime = RUNTIMES[integrationId];
        
        if (!runtime) {
          console.warn(`No runtime for integration: ${integrationId}`);
          continue;
        }

        try {
          const token = await getValidAccessToken(input.orgId, integrationId);
          // Context Resolution
          const context = await runtime.resolveContext(token);
          const capability = runtime.capabilities[task.capabilityId];
          
          if (!capability) {
             throw new Error(`Capability ${task.capabilityId} not found in runtime ${integrationId}`);
          }

          // Execute
          const result = await capability.execute(task.params, context);
          executionResults.push({ task, result });
        } catch (e) {
          console.error(`Task ${task.id} failed:`, e);
          executionError = e instanceof Error ? e.message : "Unknown execution error";
        }
      }
    }
  }

  // 3. Output Generation
  
  // Branch A: Create Mode (Mini App Materialization)
  if (input.mode === "create") {
      if (intent.intent_type !== "create" && intent.intent_type !== "modify") {
          return {
              explanation: "I couldn't determine how to build a tool from your request. Please clarify.",
              message: { type: "text", content: "I couldn't determine how to build a tool from your request. Please clarify." },
              spec: input.currentSpec
          };
      }

      const mutation = intent.tool_mutation;
      if (!mutation) {
          return {
              explanation: "I understood your request but couldn't generate a valid tool specification.",
              message: { type: "text", content: "I understood your request but couldn't generate a valid tool specification." },
              spec: input.currentSpec
          };
      }

      // Apply Mutation to Spec
      let updatedSpec = { ...input.currentSpec };
      updatedSpec.kind = "mini_app"; // Enforce Kind

      if (mutation.pagesAdded) {
          updatedSpec.pages = [...(updatedSpec.pages || []), ...mutation.pagesAdded];
      }
      // If components added without page, add to first page
      if (mutation.componentsAdded && mutation.componentsAdded.length > 0) {
          if (!updatedSpec.pages || updatedSpec.pages.length === 0) {
              updatedSpec.pages = [{ id: "page_home", name: "Home", components: [], layoutMode: "grid", state: {} }];
          }
          updatedSpec.pages[0].components = [...updatedSpec.pages[0].components, ...mutation.componentsAdded];
      }
      if (mutation.actionsAdded) {
          updatedSpec.actions = [...(updatedSpec.actions || []), ...mutation.actionsAdded];
      }
      if (mutation.stateAdded) {
          updatedSpec.state = { ...(updatedSpec.state || {}), ...mutation.stateAdded };
      }

      // Verify Contract
      const hasUI = updatedSpec.pages?.some(p => p.components.length > 0);
      if (!hasUI) {
          return {
              explanation: "I failed to generate a visible user interface. Please try again.",
              message: { type: "text", content: "I failed to generate a visible user interface. Please try again." },
              spec: input.currentSpec
          };
      }

      return {
          explanation: "I've built your mini app.",
          message: { type: "text", content: "I've built your mini app." },
          spec: updatedSpec,
          metadata: { persist: true }
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
      return {
          explanation: "Here are the results.",
          message: { type: "text", content },
          spec: input.currentSpec
      };
  }

  if (executionError) {
      return {
          explanation: `I encountered an error: ${executionError}`,
          message: { type: "text", content: `Error: ${executionError}` },
          spec: input.currentSpec
      };
  }

  return {
      explanation: "I understood your request but didn't find any actions to take.",
      message: { type: "text", content: "I understood your request but didn't find any actions to take." },
      spec: input.currentSpec
  };
}
