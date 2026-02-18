import { requireOrgMember } from "@/lib/permissions";
import { getActionsForIntegration } from "@/lib/actionkit/registry";
import { getComposioEntityId } from "@/lib/integrations/composio/connection";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: integrationId } = await params;
    const { ctx } = await requireOrgMember();

    if (!integrationId?.trim()) {
      return errorResponse("Invalid integration ID", 400);
    }

    const { searchParams } = new URL(req.url);
    const typeFilter = searchParams.get("type"); // READ | WRITE | MUTATE | NOTIFY
    const resourceFilter = searchParams.get("resource");
    const forceRefresh = searchParams.get("refresh") === "true";

    const entityId = getComposioEntityId(ctx.orgId);
    let actions = await getActionsForIntegration(integrationId, {
      forceRefresh,
      entityId,
    });

    // Apply filters
    if (typeFilter) {
      const types = typeFilter.split(",").map((t) => t.trim().toUpperCase());
      actions = actions.filter((a) => types.includes(a.actionType));
    }
    if (resourceFilter) {
      const lower = resourceFilter.toLowerCase();
      actions = actions.filter((a) => a.resource.toLowerCase().includes(lower));
    }

    return jsonResponse({
      integrationId,
      count: actions.length,
      actions,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
