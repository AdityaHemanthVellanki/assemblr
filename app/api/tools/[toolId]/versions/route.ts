import { NextResponse } from "next/server";

import { requireOrgMember, requireProjectOrgAccess } from "@/lib/auth/permissions.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ToolSystemSpec } from "@/lib/toolos/spec";
import { jsonResponse, errorResponse } from "@/lib/api/response";

type VersionSummary = {
  id: string;
  status: string;
  created_at: string;
  created_by: string | null;
  purpose: string;
  integrations_used: string[];
  breaking_change: boolean;
  diff: Record<string, any> | null;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  try {
    const { toolId } = await params;
    const { ctx } = await requireOrgMember();
    await requireProjectOrgAccess(ctx, toolId);
    const supabase = await createSupabaseServerClient();

    const { data: project } = await (supabase.from("projects") as any)
      .select("active_version_id")
      .eq("id", toolId)
      .eq("org_id", ctx.orgId)
      .single();

    const { data, error } = await (supabase.from("tool_versions") as any)
      .select("id, status, created_at, created_by, purpose, tool_spec, diff, compiled_intent")
      .eq("tool_id", toolId)
      .eq("org_id", ctx.orgId)
      .order("created_at", { ascending: false });

    if (error) {
      return errorResponse("Failed to load versions", 500);
    }

    const versions: VersionSummary[] = (data ?? []).map((row: any) => {
      const spec = row.tool_spec as ToolSystemSpec;
      const integrations =
        Array.isArray(spec?.integrations) && spec.integrations.length > 0
          ? spec.integrations.map((i) => i.id)
          : Array.from(
              new Set((spec?.actions ?? []).map((action) => action.integrationId).filter(Boolean)),
            );
      const diff = row.diff ?? null;
      const breakingChange = Boolean(
        diff &&
          (diff.permissions_changed === true ||
            (Array.isArray(diff.integrations_changed) && diff.integrations_changed.length > 0) ||
            diff.entities_removed?.length > 0 ||
            diff.actions_removed?.length > 0),
      );

      return {
        id: row.id,
        status: row.id === project?.active_version_id ? "active" : row.status,
        created_at: row.created_at,
        created_by: row.created_by,
        purpose: row.purpose || "Tool update",
        integrations_used: integrations,
        breaking_change: breakingChange,
        diff,
      };
    });

    return jsonResponse({ versions });
  } catch (e) {
    console.error("Versions fetch failed", e);
    return errorResponse("Versions fetch failed", 500);
  }
}
