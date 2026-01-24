"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { processToolChat, detectIntegrations } from "@/lib/ai/tool-chat";
import { isToolSystemSpec } from "@/lib/toolos/spec";
import { loadIntegrationConnections } from "@/lib/integrations/loadIntegrationConnections";
import { requireOrgMemberOptional } from "@/lib/auth/permissions.server";
import { resolveBuildContext } from "@/lib/toolos/build-context";
import { getSessionOnce } from "@/lib/auth/session.server";
import { PROJECT_STATUSES } from "@/lib/core/constants";

export async function sendChatMessage(
  toolId: string | undefined,
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  currentSpec: unknown | null,
  requiredIntegrations?: string[]
) {
  // 1. Authenticate User
  const session = await getSessionOnce();
  if (!session?.user) {
    return { error: "Unauthorized" };
  }
  const userId = session.user.id;

  let effectiveToolId = toolId;
  let effectiveSpec = currentSpec;
  let orgId: string;

  // 2. Resolve Context & Create Tool (if needed)
  if (!effectiveToolId) {
    // Creation Flow: Use resolveBuildContext to guarantee Org exists
    try {
      // Auto-resolve org (creates one if missing)
      const buildContext = await resolveBuildContext(userId);
      orgId = buildContext.orgId;
      
      console.log("[ToolCreation] Context Resolved:", { orgId, userId });

      // CRITICAL: Use Admin Client for atomic creation
      const adminSupabase = createSupabaseAdminClient();
      
      const payload = {
          org_id: orgId,
          name: "New Tool",
          status: "DRAFT",
          spec: {}
      };
      
      // FAIL-FAST GUARD
      if (!PROJECT_STATUSES.includes(payload.status as any)) {
        throw new Error(`Invalid project status: ${payload.status}`);
      }

      const { data: newProjects, error } = await adminSupabase
        .from("projects")
        .insert(payload)
        .select("id");
      
      // FIX: Safe retrieval of ID
      const newProject = newProjects && newProjects.length > 0 ? newProjects[0] : null;

      if (error || !newProject) {
          console.error("[ToolCreation] DB INSERT FAILED", {
              code: error?.code,
              message: error?.message,
              details: error?.details,
              hint: error?.hint,
              payload
          });
          throw new Error(`Failed to create project: ${error?.message || "Unknown error"} (Code: ${error?.code})`);
      }
      
      effectiveToolId = newProject.id;
      console.log("[ToolCreation] Success:", effectiveToolId);

    } catch (err) {
      console.error("[ToolCreation] Critical Failure", err);
      return { error: err instanceof Error ? err.message : "Failed to create tool" };
    }
  } else {
    // Load Flow: Verify access
    const { ctx, error } = await requireOrgMemberOptional();
    if (!ctx) return { error: error?.message ?? "Unauthorized" };
    
    // Verify tool ownership/access
    const supabase = await createSupabaseServerClient();
    const { data: project, error: loadError } = await supabase
        .from("projects")
        .select("org_id, spec")
        .eq("id", effectiveToolId)
        .single();
        
    if (loadError || !project) {
        return { error: "Project not found or access denied" };
    }
    
    orgId = project.org_id;
    if (!effectiveSpec) effectiveSpec = project.spec as any;
  }

  // 3. Load Connections & Process Chat
  const supabase = await createSupabaseServerClient();
  const connections = await loadIntegrationConnections({ supabase, orgId });
  const connectedIntegrationIds = connections.map((c) => c.integration_id);
  const requestedIntegrations =
    requiredIntegrations && requiredIntegrations.length > 0
      ? requiredIntegrations
      : detectIntegrations(message);
  const allowedIntegrations = ["github", "slack", "notion", "linear", "google"];
  const normalizedRequested = requestedIntegrations.filter((id) =>
    allowedIntegrations.includes(id),
  );
  const missingIntegrations = normalizedRequested.filter(
    (id) => !connectedIntegrationIds.includes(id),
  );
  if (missingIntegrations.length > 0) {
    return {
      requiresIntegrations: true,
      missingIntegrations,
      requiredIntegrations: normalizedRequested,
      toolId: effectiveToolId,
    };
  }

  const response = await processToolChat({
    orgId,
    toolId: effectiveToolId,
    userId: userId,
    currentSpec: effectiveSpec as any,
    messages: history,
    userMessage: message,
    connectedIntegrationIds,
    mode: "create", 
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
