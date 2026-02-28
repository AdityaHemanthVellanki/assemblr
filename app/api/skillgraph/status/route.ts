import { NextResponse } from "next/server";
import { requireOrgMember, PermissionError } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadIntegrationConnections } from "@/lib/integrations/loadIntegrationConnections";
import type { IntegrationStatus } from "@/components/dashboard/integration-health";
import type { MiningStatusData } from "@/components/dashboard/mining-status";

export const dynamic = "force-dynamic";

/**
 * GET /api/skillgraph/status
 *
 * Returns the current skill graph workspace state for the dashboard:
 * - Integration health (connected + ingestion status)
 * - Mining status (event count, pattern count, graph stats)
 * - Compiled skills
 *
 * Reads directly from the raw spec JSONB instead of going through
 * the full Zod workspace schema parse — this prevents a single invalid
 * event from causing the entire status to show as empty.
 */
export async function GET() {
  try {
    const { ctx } = await requireOrgMember();
    const supabase = await createSupabaseServerClient();

    // Find the workspace project directly — use contains filter to avoid loading ALL project specs
    const { data: workspaceRows } = await (supabase
      .from("projects") as any)
      .select("id, spec")
      .eq("org_id", ctx.orgId)
      .contains("spec", { type: "skill_graph_workspace" })
      .order("updated_at", { ascending: false })
      .limit(1);

    const workspaceId: string | null = workspaceRows?.[0]?.id ?? null;
    const spec: any = workspaceRows?.[0]?.spec ?? null;

    // Extract data directly from the raw spec (no full Zod parse)
    const ingestionState = spec?.ingestionState || {
      lastSync: {},
      status: {},
      totalEvents: 0,
      errors: {},
    };
    const events: any[] = Array.isArray(spec?.events) ? spec.events : [];
    const minedPatterns: any[] = Array.isArray(spec?.minedPatterns)
      ? spec.minedPatterns
      : [];
    const compiledSkills: any[] = Array.isArray(spec?.compiledSkills)
      ? spec.compiledSkills
      : [];
    const eventGraph = spec?.eventGraph;

    // Load connected integrations
    const connections = await loadIntegrationConnections({
      supabase,
      orgId: ctx.orgId,
    });
    const connectedIds = connections.map((c) => c.integration_id);

    // Build integration health status
    const integrations: IntegrationStatus[] = connectedIds.map((id) => {
      const status = ingestionState.status?.[id];
      const lastSync = ingestionState.lastSync?.[id];
      const error = ingestionState.errors?.[id];

      // Count events from this integration
      const eventCount = events.filter((e: any) => e.source === id).length;

      return {
        id,
        name: id,
        status: status || "idle",
        lastSync,
        eventCount,
        error,
      };
    });

    // Build mining status
    const mining: MiningStatusData = {
      stage: minedPatterns.length > 0 ? "complete" : "idle",
      patternCount: minedPatterns.length,
      crossSystemCount: minedPatterns.filter((p: any) => p.crossSystem).length,
      eventCount: events.length,
      nodeCount: eventGraph?.stats?.nodeCount || 0,
      edgeCount: eventGraph?.stats?.edgeCount || 0,
    };

    return NextResponse.json(
      {
        workspaceId,
        integrations,
        mining,
        skills: compiledSkills,
        connectedIntegrationIds: connectedIds,
      },
      {
        headers: {
          "Cache-Control": "private, max-age=5, stale-while-revalidate=10",
        },
      },
    );
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[API] /api/skillgraph/status error:", err);
    return NextResponse.json(
      { error: "Failed to load status" },
      { status: 500 },
    );
  }
}
