import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgMember, PermissionError } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createEmptyWorkspace,
} from "@/lib/skillgraph/events/event-schema";
import type { SkillGraphWorkspace } from "@/lib/skillgraph/events/event-schema";
import { processSkillChat } from "@/lib/skillgraph/chat/skill-chat";

export const dynamic = "force-dynamic";

const chatBodySchema = z.object({
  message: z.string().min(1),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .default([]),
});

/**
 * POST /api/skillgraph/chat
 *
 * Chat-guided exploration of discovered patterns and skill graphs.
 *
 * Reads workspace from raw spec JSONB to avoid full Zod parse failures.
 */
export async function POST(req: Request) {
  try {
    const { ctx } = await requireOrgMember();

    const json = await req.json().catch(() => ({}));
    const parsed = chatBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid body: message is required" },
        { status: 400 },
      );
    }

    const { message, history } = parsed.data;
    const supabase = await createSupabaseServerClient();

    // Find workspace project (filter server-side to avoid loading all projects)
    const { data: workspaceRows } = await (supabase.from("projects") as any)
      .select("id, spec")
      .eq("org_id", ctx.orgId)
      .contains("spec", { type: "skill_graph_workspace" })
      .order("updated_at", { ascending: false })
      .limit(1);

    let workspace: SkillGraphWorkspace = createEmptyWorkspace();

    if (workspaceRows?.[0]) {
      const spec = workspaceRows[0].spec as any;
      // Read directly from raw spec (avoids strict Zod parse failures)
      workspace = {
        type: "skill_graph_workspace",
        events: Array.isArray(spec.events) ? spec.events : [],
        eventGraph: spec.eventGraph,
        minedPatterns: Array.isArray(spec.minedPatterns)
          ? spec.minedPatterns
          : [],
        compiledSkills: Array.isArray(spec.compiledSkills)
          ? spec.compiledSkills
          : [],
        ingestionState: spec.ingestionState || {
          lastSync: {},
          status: {},
          totalEvents: 0,
          errors: {},
        },
      };
    }

    const response = await processSkillChat({
      userMessage: message,
      workspace,
      history,
    });

    return NextResponse.json({
      message: response.message,
      intent: response.intent,
      data: response.data,
    });
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[API] /api/skillgraph/chat error:", err);
    return NextResponse.json(
      { error: "Failed to process chat message" },
      { status: 500 },
    );
  }
}
