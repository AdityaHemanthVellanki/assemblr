import { requireOrgMember } from "@/lib/permissions";
import { getActionsForIntegrations } from "@/lib/actionkit/registry";
import { getComposioEntityId } from "@/lib/integrations/composio/connection";
import { loadIntegrationConnections } from "@/lib/integrations/loadIntegrationConnections";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { ctx } = await requireOrgMember();
    const supabase = createSupabaseAdminClient();
    const { searchParams } = new URL(req.url);

    const typeFilter = searchParams.get("type");
    const integrationFilter = searchParams.get("integration");

    // Get connected integrations for this org
    const connections = await loadIntegrationConnections({
      supabase,
      orgId: ctx.orgId,
    });
    let integrationIds = connections.map((c) => c.integration_id);

    if (integrationFilter) {
      const requested = integrationFilter.split(",").map((s) => s.trim().toLowerCase());
      integrationIds = integrationIds.filter((id) => requested.includes(id));
    }

    if (integrationIds.length === 0) {
      return jsonResponse({ integrations: {}, totalActions: 0 });
    }

    const entityId = getComposioEntityId(ctx.orgId);
    const actionsMap = await getActionsForIntegrations(integrationIds, entityId);

    // Build response with optional type filter
    const result: Record<string, any> = {};
    let totalActions = 0;

    for (const [integrationId, actions] of actionsMap) {
      let filtered = actions;
      if (typeFilter) {
        const types = typeFilter.split(",").map((t) => t.trim().toUpperCase());
        filtered = filtered.filter((a) => types.includes(a.actionType));
      }
      result[integrationId] = filtered;
      totalActions += filtered.length;
    }

    return jsonResponse({ integrations: result, totalActions });
  } catch (e) {
    return handleApiError(e);
  }
}
