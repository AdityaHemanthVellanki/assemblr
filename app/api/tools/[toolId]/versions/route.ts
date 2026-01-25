import { NextResponse } from "next/server";

import { requireOrgMember, requireProjectOrgAccess } from "@/lib/permissions";
// import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ToolSystemSpec, type ViewSpecPayload } from "@/lib/toolos/spec";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api/response";

type VersionSummary = {
  id: string;
  status: string;
  created_at: string;
  created_by: string | null;
  purpose: string;
  prompt_used: string;
  integrations_used: string[];
  breaking_change: boolean;
  diff: Record<string, any> | null;
  workflows_count: number;
  triggers_count: number;
  tool_spec: ToolSystemSpec | null;
  view_spec?: ViewSpecPayload | null;
  data_snapshot?: Record<string, any> | null;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  try {
    const { toolId } = await params;
    const { ctx } = await requireOrgMember();
    await requireProjectOrgAccess(ctx, toolId);
    // Use Admin Client to bypass RLS on versions table if needed
    const supabase = createSupabaseAdminClient();

    const { data: project } = await (supabase.from("projects") as any)
      .select("active_version_id")
      .eq("id", toolId)
      .eq("org_id", ctx.orgId)
      .single();

    const { data, error } = await (supabase.from("tool_versions") as any)
      .select("id, status, created_at, purpose, prompt_used, tool_spec, view_spec, data_snapshot, diff, compiled_intent") // REMOVED: created_by
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
      const workflowsCount = Array.isArray(spec?.workflows) ? spec.workflows.length : 0;
      const triggersCount = Array.isArray(spec?.triggers) ? spec.triggers.length : 0;
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
        created_by: null, // row.created_by, // REMOVED: Schema mismatch
        purpose: row.purpose || "Tool update",
        prompt_used: row.prompt_used || row.purpose || "Tool update",
        integrations_used: integrations,
        breaking_change: breakingChange,
        diff,
        workflows_count: workflowsCount,
        triggers_count: triggersCount,
        tool_spec: spec ?? null,
        view_spec: row.view_spec ?? null,
        data_snapshot: row.data_snapshot ?? null,
      };
    });

    return jsonResponse({ versions });
  } catch (e) {
    return handleApiError(e);
  }
}
