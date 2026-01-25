import { requireOrgMember, requireProjectOrgAccess } from "@/lib/permissions";
import { getLatestToolResult } from "@/lib/toolos/materialization";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api/response";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  try {
    const { toolId } = await params;
    const { ctx } = await requireOrgMember();
    await requireProjectOrgAccess(ctx, toolId);
    const result = await getLatestToolResult(toolId, ctx.orgId);
    if (result && result.status === "MATERIALIZED") {
      return jsonResponse({ activated: true });
    }
    return errorResponse("Tool not materialized", 409, {
      status: "failed",
      reason: "No materialized result"
    });
  } catch (e) {
    return handleApiError(e);
  }
}
