import { requireOrgMember, requireProjectOrgAccess } from "@/lib/auth/permissions.server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getLatestToolResult } from "@/lib/toolos/materialization";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api/response";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  try {
    const { toolId } = await params;
    const { ctx } = await requireOrgMember();
    await requireProjectOrgAccess(ctx, toolId);
    // Use Admin Client for activation state to ensure reliability
    const supabase = createSupabaseAdminClient();
    const { data: project } = await (supabase.from("projects") as any)
      .select("id")
      .eq("id", toolId)
      .eq("org_id", ctx.orgId)
      .single();

    if (!project) {
      return errorResponse("Tool not found", 404);
    }

    const result = await getLatestToolResult(toolId, ctx.orgId);
    return jsonResponse({ activated: result?.status === "MATERIALIZED" });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  try {
    const { toolId } = await params;
    const { ctx } = await requireOrgMember();
    await requireProjectOrgAccess(ctx, toolId);
    return errorResponse("Activation is result-based", 409, {
      status: "failed",
      reason: "No materialized result"
    });
  } catch (e) {
    return handleApiError(e);
  }
}
