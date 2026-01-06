import { NextResponse } from "next/server";
import { z } from "zod";

import { processToolChat } from "@/lib/ai/tool-chat";
import { PermissionError, requireOrgMember, requireProjectOrgAccess } from "@/lib/auth/permissions";
import { getServerEnv } from "@/lib/env";
import { loadIntegrationConnections } from "@/lib/integrations/loadIntegrationConnections";
import { dashboardSpecSchema } from "@/lib/spec/dashboardSpec";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
    // 1. Auth & Access Check
    const { ctx, role } = await requireOrgMember();
    // Only owners/editors can chat (modify tool)
    if (role === "viewer") {
      return NextResponse.json({ error: "Viewers cannot modify tools" }, { status: 403 });
    }

    await requireProjectOrgAccess(ctx, toolId);

    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const { message: userMessage, mode, integrationMode, selectedIntegrations } = parsed.data;
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
      return NextResponse.json({ error: "Failed to save message" }, { status: 500 });
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
      return NextResponse.json({ error: "Failed to load chat history" }, { status: 500 });
    }

    if (!projectRes.data.spec) {
      throw new Error("Project spec is missing");
    }
    const currentSpec = dashboardSpecSchema.parse(projectRes.data.spec);

    if (!historyRes.data) {
      throw new Error("chat_messages returned null data");
    }

    const history = historyRes.data
      .reverse()
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const connectedIntegrationIds = connections.map((c) => c.integration_id);

    // 4. Call AI
    const result = await processToolChat({
      orgId: ctx.orgId,
      currentSpec,
      messages: history,
      userMessage,
      connectedIntegrationIds,
      mode,
      integrationMode,
      selectedIntegrationIds,
    });

    // 5. Update Project Spec
    if (mode === "create" && (result.metadata as any)?.persist === true) {
      const { error: updateError } = await supabase
        .from("projects")
        .update({ spec: result.spec })
        .eq("id", toolId);
 
      if (updateError) {
        console.error("Failed to update project spec", updateError);
        return NextResponse.json({ error: "Failed to save tool updates" }, { status: 500 });
      }
    }

    // 6. Insert Assistant Message
    const { error: insertAiError } = await supabase.from("chat_messages").insert({
      tool_id: toolId,
      org_id: ctx.orgId,
      role: "assistant",
      content: result.explanation,
      metadata: result.metadata ?? null,
    });
    if (insertAiError) {
      console.error("Failed to save AI message", insertAiError);
      // Non-fatal, return success anyway
    }

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : String(err);
    if (message === "AI returned non-JSON response" || message === "AI returned invalid JSON") {
         console.error("Chat API Error: AI Violation", err);
         return NextResponse.json({ error: "AI response violated JSON contract" }, { status: 500 });
    }
    console.error("Chat API Error", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
