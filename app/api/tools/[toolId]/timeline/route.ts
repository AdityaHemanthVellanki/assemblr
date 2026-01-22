import { NextResponse } from "next/server";
import { requireOrgMember, requireProjectOrgAccess } from "@/lib/auth/permissions.server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { aggregateTimeline } from "@/lib/toolos/timeline-engine";
import { isToolSystemSpec } from "@/lib/toolos/spec";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api/response";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  try {
    const { toolId } = await params;
    const { ctx } = await requireOrgMember();
    await requireProjectOrgAccess(ctx, toolId);
    // Use Admin Client for timeline aggregation to ensure reliability
    const supabase = createSupabaseAdminClient();

    const { data: project } = await (supabase.from("projects") as any)
      .select("spec, active_version_id")
      .eq("id", toolId)
      .eq("org_id", ctx.orgId)
      .single();

    if (!project || !project.spec) {
      return errorResponse("Tool not found", 404);
    }

    let spec = project.spec;
    if (project.active_version_id) {
       const { data: version } = await (supabase.from("tool_versions") as any)
        .select("tool_spec")
        .eq("id", project.active_version_id)
        .single();
       spec = version?.tool_spec ?? spec;
    }

    if (!isToolSystemSpec(spec)) {
        return errorResponse("Invalid spec", 500);
    }

    const timeline = await aggregateTimeline(ctx.orgId, toolId, spec);
    return jsonResponse({ timeline });
  } catch (e) {
    return handleApiError(e);
  }
}
