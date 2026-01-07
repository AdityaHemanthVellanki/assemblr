"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/integrations/tokenRefresh";
import { GitHubRuntime } from "@/lib/integrations/runtimes/github";
import { IntegrationRuntime } from "@/lib/core/runtime";
import { GitHubExecutor } from "@/lib/integrations/executors/github";
import { LinearExecutor } from "@/lib/integrations/executors/linear";
import { SlackExecutor } from "@/lib/integrations/executors/slack";
import { NotionExecutor } from "@/lib/integrations/executors/notion";
import { GoogleExecutor } from "@/lib/integrations/executors/google";
import { IntegrationExecutor, ExecutionResult } from "@/lib/execution/types";
import { getCapability } from "@/lib/capabilities/registry";
import { toolSpecSchema } from "@/lib/spec/dashboardSpec";

const EXECUTORS: Record<string, IntegrationExecutor> = {
  github: new GitHubExecutor(), // Legacy
  linear: new LinearExecutor(),
  slack: new SlackExecutor(),
  notion: new NotionExecutor(),
  google: new GoogleExecutor(),
};

const RUNTIMES: Record<string, IntegrationRuntime> = {
  github: new GitHubRuntime(),
};

export async function executeToolAction(
  toolId: string,
  actionId: string,
  args: Record<string, any>
): Promise<ExecutionResult> {
  const supabase = await createSupabaseServerClient();

  // 1. Fetch Tool Spec
  const { data: project } = await supabase
    .from("projects")
    .select("spec, org_id")
    .eq("id", toolId)
    .single();

  if (!project || !project.spec) {
    throw new Error("Tool not found");
  }

  // 2. Parse Spec
  const spec = toolSpecSchema.parse(project.spec);
  const action = spec.actions.find((a) => a.id === actionId);

  if (!action) {
    throw new Error(`Action ${actionId} not found`);
  }

  if (action.type !== "integration_call") {
    throw new Error("Only integration_call actions can be executed on server");
  }

  const config = action.config || {};
  const integrationId = config.integrationId;
  const capabilityId = config.capability; // Renamed to match intent
  const defaultParams = config.params;

  if (!integrationId || !capabilityId) {
    throw new Error("Invalid action configuration: missing integrationId or capabilityId");
  }

  // 3. Get Access Token
  const accessToken = await getValidAccessToken(project.org_id, integrationId);

  // 4. Execute using Runtime (Preferred) or Legacy Executor
  const runtime = RUNTIMES[integrationId];
  if (runtime) {
      const cap = runtime.capabilities[capabilityId];
      if (!cap) throw new Error(`Capability ${capabilityId} not found in runtime`);
      
      const context = await runtime.resolveContext(accessToken);
      const mergedParams = { ...(defaultParams || {}), ...args };
      
      // Execute
      const data = await cap.execute(mergedParams, context);
      
      // Standardize result
      return {
          viewId: "action_exec",
          status: "success",
          rows: Array.isArray(data) ? data : [data],
          timestamp: new Date().toISOString(),
          source: "live_api"
      };
  }

  // Fallback to Legacy Executor
  const executor = EXECUTORS[integrationId];
  if (!executor) {
    throw new Error(`No executor for ${integrationId}`);
  }

  const capDef = getCapability(capabilityId);
  if (!capDef) {
    throw new Error(`Capability ${capabilityId} not found`);
  }

  const mergedParams = { ...(defaultParams || {}), ...args };

  const result = await executor.execute({
    plan: {
      viewId: "action_exec",
      integrationId,
      resource: capDef.resource, // Derived from capability
      params: mergedParams,
    },
    credentials: { access_token: accessToken },
  });

  return result;
}
