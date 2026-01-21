"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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
    // CRITICAL: Use Admin Client to guarantee creation (bypassing potential RLS issues on insert)
    console.log("[ToolCreation] Using Service Role Admin Client");
    const adminSupabase = createSupabaseAdminClient();
    const payload = {
        org_id: orgId,
        owner_id: ctx.userId,
        name: "New Tool",
        status: "draft",
        spec: {} as any
    };
    const { data: newProjects, error } = await adminSupabase.from("projects").insert(payload).select("id");
    
    // FIX: Safe retrieval of ID - do not assume .single() works blindly
    const newProject = newProjects && newProjects.length > 0 ? newProjects[0] : null;

    if (error || !newProject) {
        console.error("[ToolCreation] FAILED", {
            code: error?.code,
            message: error?.message,
            details: error?.details,
            hint: error?.hint,
            payload
        });
        throw new Error(`Failed to create project: ${error?.message || "Unknown error"}`);
    }
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
