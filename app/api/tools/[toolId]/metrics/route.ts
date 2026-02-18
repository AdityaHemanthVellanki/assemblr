import { requireOrgMember, requireProjectOrgAccess } from "@/lib/permissions";
import { getToolHealth, getMetrics } from "@/lib/observability/metrics";
import { jsonResponse, handleApiError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  try {
    const { toolId } = await params;
    const { ctx } = await requireOrgMember();
    await requireProjectOrgAccess(ctx, toolId);

    const url = new URL(req.url);
    const windowHours = Number(url.searchParams.get("windowHours") ?? 24);
    const metricName = url.searchParams.get("metricName") ?? undefined;
    const limit = Number(url.searchParams.get("limit") ?? 100);

    const since = new Date(
      Date.now() - windowHours * 3600_000,
    ).toISOString();

    const [health, metrics] = await Promise.all([
      getToolHealth({ toolId, orgId: ctx.orgId, windowHours }),
      getMetrics({ toolId, metricName, since, limit }),
    ]);

    return jsonResponse({ health, metrics });
  } catch (e) {
    return handleApiError(e);
  }
}
