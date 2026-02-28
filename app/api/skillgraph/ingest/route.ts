import { NextResponse } from "next/server";
import { requireOrgMember, PermissionError } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createEmptyWorkspace } from "@/lib/skillgraph/events/event-schema";
import type { SkillGraphWorkspace } from "@/lib/skillgraph/events/event-schema";
import { loadIntegrationConnections } from "@/lib/integrations/loadIntegrationConnections";
import {
  runIngestionPipeline,
  ingestSingleIntegration,
} from "@/lib/skillgraph/ingestion/ingest-pipeline";
import type { IntegrationId } from "@/lib/toolos/spec";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // 2 minute timeout for ingestion

/**
 * POST /api/skillgraph/ingest
 *
 * Trigger data ingestion from connected integrations.
 * Body: { integrationId?: string } — optional single-integration sync.
 *
 * Reads workspace from raw spec JSONB to avoid full Zod parse failures.
 */
export async function POST(req: Request) {
  try {
    const { ctx } = await requireOrgMember();
    const supabase = await createSupabaseServerClient();

    const body = await req.json().catch(() => ({}));
    const targetIntegrationId = body.integrationId as string | undefined;

    // Find or create workspace project (filter server-side to avoid loading all projects)
    const { data: workspaceRows } = await (supabase
      .from("projects") as any)
      .select("id, spec")
      .eq("org_id", ctx.orgId)
      .contains("spec", { type: "skill_graph_workspace" })
      .order("updated_at", { ascending: false })
      .limit(1);

    let workspaceId: string | null = workspaceRows?.[0]?.id ?? null;
    let workspace: SkillGraphWorkspace = createEmptyWorkspace();

    if (workspaceId) {
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

    // Create workspace project if none exists
    if (!workspaceId) {
      const { data: newProject, error: createError } = await supabase
        .from("projects")
        .insert({
          org_id: ctx.orgId,
          name: "Skill Graph Workspace",
          spec: workspace as any,
        })
        .select("id")
        .single();

      if (createError || !newProject) {
        console.error(
          "[API] Failed to create workspace project:",
          createError,
        );
        return NextResponse.json(
          { error: "Failed to create workspace" },
          { status: 500 },
        );
      }
      workspaceId = newProject.id;
    }

    // Load connected integrations
    const connections = await loadIntegrationConnections({
      supabase,
      orgId: ctx.orgId,
    });
    const connectedIds = connections.map((c) => c.integration_id);

    // Run ingestion
    let result;
    if (targetIntegrationId) {
      result = await ingestSingleIntegration({
        orgId: ctx.orgId,
        integrationId: targetIntegrationId as IntegrationId,
        existingWorkspace: workspace,
      });
    } else {
      result = await runIngestionPipeline({
        orgId: ctx.orgId,
        connectedIntegrationIds: connectedIds,
        existingWorkspace: workspace,
      });
    }

    // Save updated workspace
    const { error: saveError } = await supabase
      .from("projects")
      .update({
        spec: result as any,
        updated_at: new Date().toISOString(),
      })
      .eq("id", workspaceId);

    if (saveError) {
      console.error("[API] Failed to save workspace:", saveError);
      return NextResponse.json(
        { error: "Failed to save workspace" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      workspaceId,
      eventCount: result.events.length,
      newEvents: result.events.length - workspace.events.length,
    });
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[API] /api/skillgraph/ingest error:", err);
    return NextResponse.json(
      { error: "Ingestion failed" },
      { status: 500 },
    );
  }
}
