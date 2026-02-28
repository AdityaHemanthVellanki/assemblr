import { NextResponse } from "next/server";
import { requireOrgMember, PermissionError } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SkillGraphWorkspace } from "@/lib/skillgraph/events/event-schema";
import { runMiningPipeline } from "@/lib/skillgraph/mining/mining-pipeline";
import { compileAllPatterns } from "@/lib/skillgraph/compiler/compile-skill";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 1 minute timeout for mining

/**
 * POST /api/skillgraph/mine
 *
 * Trigger pattern mining + skill compilation on the current workspace events.
 *
 * Reads directly from the raw spec JSONB to avoid full Zod parse failures
 * (same approach as the status endpoint).
 */
export async function POST() {
  try {
    const { ctx } = await requireOrgMember();
    const supabase = await createSupabaseServerClient();

    // Find workspace project directly
    const { data: workspaceRows } = await (supabase
      .from("projects") as any)
      .select("id, spec")
      .eq("org_id", ctx.orgId)
      .contains("spec", { type: "skill_graph_workspace" })
      .order("updated_at", { ascending: false })
      .limit(1);

    const workspaceId: string | null = workspaceRows?.[0]?.id ?? null;
    const spec: any = workspaceRows?.[0]?.spec ?? null;

    if (!workspaceId || !spec) {
      return NextResponse.json(
        { error: "No workspace found. Run ingestion first." },
        { status: 400 },
      );
    }

    // Build workspace from raw spec (bypasses strict Zod parse)
    const events = Array.isArray(spec.events) ? spec.events : [];

    if (events.length === 0) {
      return NextResponse.json(
        { error: "No events to mine. Run ingestion first." },
        { status: 400 },
      );
    }

    const workspace: SkillGraphWorkspace = {
      type: "skill_graph_workspace",
      events,
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

    // Run mining pipeline
    const mined = await runMiningPipeline({ workspace });

    // Compile patterns into skill graphs
    const compiledSkills = compileAllPatterns(mined.minedPatterns);
    const result = { ...mined, compiledSkills };

    // Save updated workspace
    const { error: saveError } = await supabase
      .from("projects")
      .update({
        spec: result as any,
        updated_at: new Date().toISOString(),
      })
      .eq("id", workspaceId);

    if (saveError) {
      console.error("[API] Failed to save mined workspace:", saveError);
      return NextResponse.json(
        { error: "Failed to save mining results" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      workspaceId,
      patternCount: result.minedPatterns.length,
      crossSystemCount: result.minedPatterns.filter(
        (p: any) => p.crossSystem,
      ).length,
      skillCount: compiledSkills.length,
    });
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[API] /api/skillgraph/mine error:", err);
    return NextResponse.json(
      { error: "Mining failed" },
      { status: 500 },
    );
  }
}
