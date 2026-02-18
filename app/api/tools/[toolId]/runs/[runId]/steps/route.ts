import { requireOrgMember } from "@/lib/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStepsForRun } from "@/lib/toolos/workflow-steps";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ toolId: string; runId: string }> },
) {
  try {
    const { toolId, runId } = await params;
    const { ctx } = await requireOrgMember();
    const supabase = createSupabaseAdminClient();

    // Verify run belongs to this tool and org
    const { data: run, error } = await (supabase.from("execution_runs") as any)
      .select("id")
      .eq("id", runId)
      .eq("tool_id", toolId)
      .eq("org_id", ctx.orgId)
      .single();

    if (error || !run) {
      return errorResponse("Run not found", 404);
    }

    const steps = await getStepsForRun(runId);
    return jsonResponse(steps);
  } catch (e) {
    return handleApiError(e);
  }
}
