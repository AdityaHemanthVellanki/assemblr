"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { processToolChat } from "@/lib/ai/tool-chat";
import { isToolSystemSpec } from "@/lib/toolos/spec";
import { loadIntegrationConnections } from "@/lib/integrations/loadIntegrationConnections";

export async function sendChatMessage(
  toolId: string | undefined,
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  currentSpec: unknown | null
) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error("Unauthorized");

  let effectiveToolId = toolId;
  let effectiveSpec = currentSpec;
  let orgId = "";

  // 1. Resolve Tool & Org
  if (!effectiveToolId) {
    // Create new project
    const { data: org } = await supabase.from("memberships").select("org_id").eq("user_id", user.id).limit(1).single();
    if (!org) throw new Error("No organization found");
    orgId = org.org_id;

    const { data: newProject, error } = await supabase.from("projects").insert({
        org_id: orgId,
        name: "New Tool",
        spec: {} as any
    }).select("id").single();

    if (error || !newProject) throw new Error("Failed to create project");
    effectiveToolId = newProject.id;
  } else {
    const { data: project } = await supabase.from("projects").select("org_id, spec").eq("id", effectiveToolId).single();
    if (!project) throw new Error("Project not found");
    orgId = project.org_id;
    if (!effectiveSpec) effectiveSpec = project.spec as any;
  }

  const connections = await loadIntegrationConnections({ supabase, orgId });
  const connectedIntegrationIds = connections.map((c) => c.integration_id);

  // 3. Process Chat
  const response = await processToolChat({
    orgId,
    toolId: effectiveToolId,
    currentSpec: effectiveSpec as any,
    messages: history,
    userMessage: message,
    connectedIntegrationIds,
    mode: "create", // Default to create for builder
    integrationMode: "auto",
  });

  if (response.spec && isToolSystemSpec(response.spec)) {
    await supabase
      .from("projects")
      .update({ spec: response.spec as any })
      .eq("id", effectiveToolId);
  }

  return {
    ...response,
    toolId: effectiveToolId // Return ID in case it was created
  };
}
