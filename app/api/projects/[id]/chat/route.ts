import { z } from "zod";

import { processToolChat, resolveIntegrationRequirements } from "@/lib/ai/tool-chat";
import { PermissionError, requireOrgMemberOptional, requireProjectOrgAccess } from "@/lib/permissions";
import { getServerEnv } from "@/lib/env";
import { loadIntegrationConnections } from "@/lib/integrations/loadIntegrationConnections";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { errorResponse, handleApiError, jsonResponse } from "@/lib/api/response";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  message: z.string().min(1).max(5000),
  mode: z.enum(["create", "chat"]).optional().default("create"),
  integrationMode: z.enum(["auto", "manual"]).optional().default("auto"),
  selectedIntegrations: z
    .array(
      z.object({
        id: z.string(),
        status: z.enum(["connected", "not_connected", "connecting", "error"]),
      }),
    )
    .optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  getServerEnv();

  const { id: toolId } = await params;

  try {
    const auth = await requireOrgMemberOptional();
    if (auth.requiresAuth) {
      return errorResponse("Session expired — reauth required", 401, { requiresAuth: true });
    }
    const { ctx, error } = auth;
    if (!ctx) {
      return errorResponse(error?.message ?? "Unauthorized", error?.status ?? 401);
    }
    const role = ctx.org.role as any;
    // Only owners/editors can chat (modify tool)
    if (role === "viewer") {
      return errorResponse("Viewers cannot modify tools", 403);
    }

    await requireProjectOrgAccess(ctx, toolId);

    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return errorResponse("Invalid body", 400);
    }
    const { message: userMessage, mode, integrationMode, selectedIntegrations } = parsed.data;
    if (mode !== "create") {
      return errorResponse("Only create mode is supported", 400);
    }
    const selectedIntegrationIds = selectedIntegrations?.map((i) => i.id);

    const supabase = await createSupabaseServerClient();

    // 2. Insert User Message
    const { error: insertError } = await supabase.from("chat_messages").insert({
      tool_id: toolId,
      org_id: ctx.orgId,
      role: "user",
      content: userMessage,
    });
    if (insertError) {
      console.error("Failed to save user message", insertError);
      return errorResponse("Failed to save message", 500);
    }

    const [projectRes, historyRes, connections] = await Promise.all([
      supabase.from("projects").select("spec").eq("id", toolId).single(),
      supabase
        .from("chat_messages")
        .select("role, content, metadata")
        .eq("tool_id", toolId)
        .order("created_at", { ascending: false })
        .limit(20),
      loadIntegrationConnections({ supabase, orgId: ctx.orgId }),
    ]);

    if (projectRes.error || !projectRes.data) {
      throw new Error("Failed to load project spec");
    }
    if (historyRes.error) {
      console.error("Failed to load chat history", historyRes.error);
      return errorResponse("Failed to load chat history", 500);
    }

    const currentSpec = projectRes.data.spec ?? {};

    if (!historyRes.data) {
      throw new Error("chat_messages returned null data");
    }

    const history = historyRes.data
      .reverse()
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const connectedIntegrationIds = connections.map((c) => c.integration_id);
    const integrationSelection = resolveIntegrationRequirements({
      prompt: userMessage,
      integrationMode,
      selectedIntegrationIds,
    });
    if (integrationSelection.mismatchMessage) {
      await supabase.from("chat_messages").insert({
        tool_id: toolId,
        org_id: ctx.orgId,
        role: "assistant",
        content: integrationSelection.mismatchMessage,
        metadata: null,
      });
      return jsonResponse({
        integrationMismatch: true,
        message: integrationSelection.mismatchMessage,
        toolId,
      });
    }
    const effectiveConnectedIntegrationIds =
      integrationMode === "manual" && selectedIntegrationIds?.length
        ? connectedIntegrationIds.filter((id) => selectedIntegrationIds.includes(id))
        : connectedIntegrationIds;

    // 4. Call AI
    const result = await processToolChat({
      orgId: ctx.orgId,
      toolId,
      currentSpec,
      messages: history,
      userMessage,
      connectedIntegrationIds: effectiveConnectedIntegrationIds,
      mode,
      integrationMode,
      selectedIntegrationIds,
    });

    // 5. Update Project Spec
    if (mode === "create" && (result.metadata as any)?.persist === true) {
      const { error: updateError } = await supabase
        .from("projects")
        .update({ spec: result.spec as any })
        .eq("id", toolId);
 
      if (updateError) {
        return errorResponse("Failed to save tool updates", 500);
      }
    }

    const assistantContent =
      typeof result.message?.content === "string" ? result.message.content : result.explanation;
    const { error: insertAiError } = await supabase.from("chat_messages").insert({
      tool_id: toolId,
      org_id: ctx.orgId,
      role: "assistant",
      content: assistantContent,
      metadata: result.metadata ?? null,
    });
    if (insertAiError) {
    }

    return jsonResponse(result);
  } catch (err) {
    if (err instanceof PermissionError) {
      return errorResponse(err.message, err.status);
    }
    const message = err instanceof Error ? err.message : String(err);
    if (message === "AI returned non-JSON response" || message === "AI returned invalid JSON") {
         return errorResponse("AI response violated JSON contract", 500);
    }
    return handleApiError(err);
  }
}
