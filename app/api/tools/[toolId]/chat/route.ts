import { NextResponse } from "next/server";
import { z } from "zod";

import { requireOrgMemberOptional, requireProjectOrgAccess } from "@/lib/auth/permissions.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { processToolChat } from "@/lib/ai/tool-chat";
import { loadIntegrationConnections } from "@/lib/integrations/loadIntegrationConnections";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api/response";

const chatSchema = z.object({
  message: z.string(),
  mode: z.enum(["create", "modify", "chat"]).default("chat"),
  integrationMode: z.enum(["auto", "manual"]).optional(),
  selectedIntegrationIds: z.array(z.string()).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  try {
    const { toolId } = await params;
    const { ctx, requiresAuth, error } = await requireOrgMemberOptional();
    if (requiresAuth) {
      return errorResponse("Session expired — reauth required", 401, { requiresAuth: true });
    }
    if (!ctx) {
      return errorResponse(error?.message ?? "Unauthorized", error?.status ?? 401);
    }
    await requireProjectOrgAccess(ctx, toolId);

    const json = await req.json().catch(() => ({}));
    const parsed = chatSchema.safeParse(json);
    if (!parsed.success) {
      return errorResponse("Invalid body", 400);
    }
    const { message: userMessage, mode, integrationMode, selectedIntegrationIds } = parsed.data;

    const supabase = await createSupabaseServerClient();

    // 1. Save User Message
    const { error: msgError } = await (supabase.from("chat_messages") as any).insert({
      org_id: ctx.orgId,
      tool_id: toolId,
      role: "user",
      content: userMessage,
    });
    if (msgError) {
      console.error("Failed to save message", msgError);
      return errorResponse("Failed to save message", 500);
    }

    // 2. Load Context
    const [toolRes, historyRes, connections] = await Promise.all([
      supabase.from("projects").select("spec").eq("id", toolId).single(),
      supabase
        .from("chat_messages")
        .select("role, content, metadata")
        .eq("tool_id", toolId)
        .order("created_at", { ascending: false })
        .limit(20),
      loadIntegrationConnections({ supabase, orgId: ctx.orgId }),
    ]);

    if (toolRes.error || !toolRes.data) {
      throw new Error("Failed to load tool spec");
    }
    if (historyRes.error) {
      console.error("Failed to load chat history", historyRes.error);
      return errorResponse("Failed to load chat history", 500);
    }

    const currentSpec = toolRes.data.spec ?? {};
    if (!historyRes.data) {
      throw new Error("chat_messages returned null data");
    }

    const history = historyRes.data
      .reverse()
      .map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    const connectedIntegrationIds = connections.map((c: { integration_id: string }) => c.integration_id);

    const result = await processToolChat({
      orgId: ctx.orgId,
      toolId,
      userId: ctx.userId,
      currentSpec,
      messages: history,
      userMessage,
      connectedIntegrationIds,
      mode,
      integrationMode,
      selectedIntegrationIds,
    });

    if (mode === "create" && (result.metadata as any)?.persist === true) {
      const { error: updateError } = await supabase
        .from("projects")
        .update({ spec: result.spec as any, active_version_id: (result.metadata as any)?.active_version_id ?? null })
        .eq("id", toolId);
      if (updateError) {
        console.error("Failed to update tool spec", updateError);
        return errorResponse("Failed to save tool updates", 500);
      }
    }

    // Save Assistant Message
    await (supabase.from("chat_messages") as any).insert({
      org_id: ctx.orgId,
      tool_id: toolId,
      role: "assistant",
      content: result.message.content,
      metadata: result.metadata,
    });

    return jsonResponse(result);
  } catch (e) {
    return handleApiError(e);
  }
}
