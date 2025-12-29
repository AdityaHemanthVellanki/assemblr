import { NextResponse } from "next/server";
import { z } from "zod";

import { processToolChat } from "@/lib/ai/tool-chat";
import { PermissionError, requireOrgMember, requireProjectOrgAccess } from "@/lib/auth/permissions";
import { getServerEnv } from "@/lib/env";
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

    const [toolRes, historyRes] = await Promise.all([
      supabase.from("projects").select("spec").eq("id", toolId).single(),
      supabase
        .from("chat_messages")
        .select("role, content")
        .eq("tool_id", toolId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    if (toolRes.error || !toolRes.data) {
      throw new Error("Failed to load tool spec");
    }
    if (historyRes.error) {
      console.error("Failed to load chat history", historyRes.error);
      return NextResponse.json({ error: "Failed to load chat history" }, { status: 500 });
    }

    const currentSpec = toolRes.data.spec ? dashboardSpecSchema.parse(toolRes.data.spec) : null;
    const history = (historyRes.data ?? [])
      .reverse()
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const result = await processToolChat({
      currentSpec,
      messages: history,
      userMessage,
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

