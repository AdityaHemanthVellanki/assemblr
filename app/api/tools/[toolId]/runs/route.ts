import { requireOrgMember } from "@/lib/auth/permissions.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api/response";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  try {
    const { toolId } = await params;
    const { ctx } = await requireOrgMember();
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("execution_runs")
      .select("id, status, current_step, retries, action_id, workflow_id, logs, created_at, updated_at")
      .eq("tool_id", toolId)
      .eq("org_id", ctx.orgId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      return errorResponse("Failed to load runs", 500);
    }

    return jsonResponse({ runs: data ?? [] });
  } catch (e) {
    return handleApiError(e);
  }
}
