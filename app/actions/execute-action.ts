"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/integrations/tokenRefresh";
import { GitHubExecutor } from "@/lib/integrations/executors/github";
import { LinearExecutor } from "@/lib/integrations/executors/linear";
import { SlackExecutor } from "@/lib/integrations/executors/slack";
import { NotionExecutor } from "@/lib/integrations/executors/notion";
import { GoogleExecutor } from "@/lib/integrations/executors/google";
import { IntegrationExecutor } from "@/lib/execution/types";
import { getCapability } from "@/lib/capabilities/registry";
import { toolSpecSchema } from "@/lib/spec/dashboardSpec";

const EXECUTORS: Record<string, IntegrationExecutor> = {
  github: new GitHubExecutor(),
  linear: new LinearExecutor(),
  slack: new SlackExecutor(),
  notion: new NotionExecutor(),
  google: new GoogleExecutor(),
};

export async function executeToolAction(
  toolId: string,
  actionId: string,
  args: Record<string, any>
) {
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

  const { integrationId, capability, params: defaultParams } = action.config;

  if (!integrationId || !capability) {
    throw new Error("Invalid action configuration: missing integrationId or capabilityId");
  }

  // 3. Resolve Capability & Executor
  const executor = EXECUTORS[integrationId];
  if (!executor) {
    throw new Error(`No executor for ${integrationId}`);
  }

  const capDef = getCapability(capability);
  if (!capDef) {
    throw new Error(`Capability ${capability} not found`);
  }

  // 4. Merge Params (default + args)
  // TODO: Securely handle parameter merging and validation
  const mergedParams = { ...(defaultParams || {}), ...args };

  // 5. Get Access Token
  const accessToken = await getValidAccessToken(project.org_id, integrationId);

  // 6. Execute
  // We mock a "Plan" structure expected by executor
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
