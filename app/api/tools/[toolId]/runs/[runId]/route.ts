import { requireOrgMember, requireProjectOrgAccess } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ toolId: string; runId: string }> },
) {
  try {
    const { toolId, runId } = await params;
    const { ctx } = await requireOrgMember();
    await requireProjectOrgAccess(ctx, toolId);
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("execution_runs")
      .select("*")
      .eq("id", runId)
      .eq("tool_id", toolId)
      .eq("org_id", ctx.orgId)
      .single();

    if (error || !data) {
      return errorResponse("Run not found", 404);
    }

    return jsonResponse({ run: data });
  } catch (e) {
    return handleApiError(e);
  }
}
