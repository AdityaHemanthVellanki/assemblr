"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { processToolChat } from "@/lib/ai/tool-chat";
import { isToolSystemSpec } from "@/lib/toolos/spec";
import { loadIntegrationConnections } from "@/lib/integrations/loadIntegrationConnections";
import { requireOrgMemberOptional } from "@/lib/auth/permissions.server";

export async function sendChatMessage(
  toolId: string | undefined,
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  currentSpec: unknown | null
) {
  const { ctx, requiresAuth, error } = await requireOrgMemberOptional();
  if (requiresAuth) {
    return { requiresAuth: true };
  }
  if (!ctx) {
    return { error: error?.message ?? "Unauthorized" };
  }

  let effectiveToolId = toolId;
  let effectiveSpec = currentSpec;
  let orgId = ctx.orgId;

  // 1. Resolve Tool & Org
  if (!effectiveToolId) {
    const supabase = await createSupabaseServerClient();
    const { data: newProject, error } = await supabase.from("projects").insert({
        org_id: orgId,
        name: "New Tool",
        spec: {} as any
    }).select("id").single();

    if (error || !newProject) throw new Error("Failed to create project");
    effectiveToolId = newProject.id;
  } else {
    const supabase = await createSupabaseServerClient();
    const { data: project } = await supabase.from("projects").select("org_id, spec").eq("id", effectiveToolId).single();
    if (!project) throw new Error("Project not found");
    orgId = project.org_id;
    if (!effectiveSpec) effectiveSpec = project.spec as any;
  }

  const supabase = await createSupabaseServerClient();
  const connections = await loadIntegrationConnections({ supabase, orgId });
  const connectedIntegrationIds = connections.map((c) => c.integration_id);

  const response = await processToolChat({
    orgId,
    toolId: effectiveToolId,
    userId: ctx.userId,
    currentSpec: effectiveSpec as any,
    messages: history,
    userMessage: message,
    connectedIntegrationIds,
    mode: "create", // Default to create for builder
    integrationMode: "auto",
  });

  if (response.spec && isToolSystemSpec(response.spec) && response.metadata?.active_version_id) {
    await supabase
      .from("projects")
      .update({ spec: response.spec as any, active_version_id: response.metadata.active_version_id })
      .eq("id", effectiveToolId);
  }

  return {
    ...response,
    toolId: effectiveToolId
  };
}
