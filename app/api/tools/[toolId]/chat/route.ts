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
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  getServerEnv();

  const { toolId } = await params;

  try {
    const { ctx, role } = await requireOrgMember();
    if (role === "viewer") {
      return NextResponse.json({ error: "Viewers cannot modify tools" }, { status: 403 });
    }

    await requireProjectOrgAccess(ctx, toolId);

    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const userMessage = parsed.data.message;
    const supabase = await createSupabaseServerClient();

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
      return NextResponse.json({ error: "Failed to load chat history" }, { status: 500 });
    }

    if (!toolRes.data.spec) {
      throw new Error("Tool spec is missing");
    }
    const currentSpec = dashboardSpecSchema.parse(toolRes.data.spec);
    if (!historyRes.data) {
      throw new Error("chat_messages returned null data");
    }

    const history = historyRes.data
      .reverse()
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const connectedIntegrationIds = connections.map((c) => c.integration_id);

    const result = await processToolChat({
      currentSpec,
      messages: history,
      userMessage,
      connectedIntegrationIds,
    });

    const { error: updateError } = await supabase
      .from("projects")
      .update({ spec: result.spec })
      .eq("id", toolId);
    if (updateError) {
      console.error("Failed to update tool spec", updateError);
      return NextResponse.json({ error: "Failed to save tool updates" }, { status: 500 });
    }

    const { error: insertAiError } = await supabase.from("chat_messages").insert({
      tool_id: toolId,
      org_id: ctx.orgId,
      role: "assistant",
      content: result.explanation,
      metadata: result.metadata ?? null, // Save metadata (e.g. missing_integration_id)
    });
    if (insertAiError) {
      console.error("Failed to save AI message", insertAiError);
    }

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Tool chat API error", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
