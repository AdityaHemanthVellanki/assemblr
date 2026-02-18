import { requireOrgMember, requireRole, requireProjectOrgAccess } from "@/lib/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createWebhookEndpoint } from "@/lib/toolos/webhook-store";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

/**
 * GET /api/tools/[toolId]/webhooks
 * List all webhook endpoints for a tool.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  try {
    const { toolId } = await params;
    const { ctx } = await requireOrgMember();
    await requireProjectOrgAccess(ctx, toolId);
    const supabase = createSupabaseAdminClient();

    const { data, error } = await (supabase.from("webhook_endpoints") as any)
      .select("*")
      .eq("tool_id", toolId)
      .eq("org_id", ctx.orgId)
      .order("created_at", { ascending: false });

    if (error) {
      return errorResponse("Failed to list webhooks", 500);
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL ?? "http://localhost:3000";
    const host = baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`;

    const webhooks = (data ?? []).map((row: any) => ({
      id: row.id,
      triggerId: row.trigger_id,
      url: `${host}/api/webhooks/${row.id}`,
      enabled: row.enabled,
      invocationCount: row.invocation_count ?? 0,
      lastInvokedAt: row.last_invoked_at,
      createdAt: row.created_at,
    }));

    return jsonResponse({ webhooks });
  } catch (e) {
    return handleApiError(e);
  }
}

/**
 * POST /api/tools/[toolId]/webhooks
 * Create a new webhook endpoint for a trigger.
 * Body: { triggerId: string }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  try {
    const { toolId } = await params;
    const { ctx } = await requireRole("editor");
    await requireProjectOrgAccess(ctx, toolId);

    const body = await req.json().catch(() => ({}));
    const triggerId = typeof body?.triggerId === "string" ? body.triggerId : null;

    if (!triggerId) {
      return errorResponse("triggerId is required", 400);
    }

    const endpoint = await createWebhookEndpoint({
      orgId: ctx.orgId,
      toolId,
      triggerId,
    });

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL ?? "http://localhost:3000";
    const host = baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`;

    return jsonResponse({
      id: endpoint.id,
      triggerId: endpoint.triggerId,
      url: `${host}/api/webhooks/${endpoint.id}`,
      secret: endpoint.secret,
      enabled: endpoint.enabled,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

/**
 * DELETE /api/tools/[toolId]/webhooks
 * Disable a webhook endpoint.
 * Body: { webhookId: string }
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  try {
    const { toolId } = await params;
    const { ctx } = await requireRole("editor");
    await requireProjectOrgAccess(ctx, toolId);

    const body = await req.json().catch(() => ({}));
    const webhookId = typeof body?.webhookId === "string" ? body.webhookId : null;

    if (!webhookId) {
      return errorResponse("webhookId is required", 400);
    }

    const supabase = createSupabaseAdminClient();
    const { error } = await (supabase.from("webhook_endpoints") as any)
      .update({ enabled: false })
      .eq("id", webhookId)
      .eq("tool_id", toolId)
      .eq("org_id", ctx.orgId);

    if (error) {
      return errorResponse("Failed to disable webhook", 500);
    }

    return jsonResponse({ status: "disabled", webhookId });
  } catch (e) {
    return handleApiError(e);
  }
}
