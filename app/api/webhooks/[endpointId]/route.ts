import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getWebhookEndpoint, verifyWebhookSignature, incrementInvocationCount } from "@/lib/toolos/webhook-store";
import { executeToolAction } from "@/lib/toolos/runtime";
import { runWorkflow } from "@/lib/toolos/workflow-engine";
import { buildCompiledToolArtifact, isCompiledToolArtifact } from "@/lib/toolos/compiler";
import { isToolSystemSpec } from "@/lib/toolos/spec";
import { jsonResponse, errorResponse } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ endpointId: string }> },
) {
  try {
    const { endpointId } = await params;
    const endpoint = await getWebhookEndpoint(endpointId);

    if (!endpoint) {
      return errorResponse("Webhook endpoint not found", 404);
    }

    if (!endpoint.enabled) {
      return errorResponse("Webhook endpoint is disabled", 403);
    }

    // Read raw body for signature verification
    const rawBody = await req.text();
    const signature = req.headers.get("x-webhook-signature") ?? "";

    // Verify HMAC signature if provided
    if (signature) {
      const isValid = verifyWebhookSignature(rawBody, signature, endpoint.secret);
      if (!isValid) {
        return errorResponse("Invalid webhook signature", 401);
      }
    }

    // Parse payload
    let payload: Record<string, any> = {};
    try {
      payload = JSON.parse(rawBody);
    } catch {
      payload = { raw: rawBody };
    }

    // Load tool and compiled artifact
    const supabase = createSupabaseAdminClient();
    const { data: project } = await (supabase.from("projects") as any)
      .select("spec, active_version_id, org_id")
      .eq("id", endpoint.toolId)
      .single();

    if (!project) {
      return errorResponse("Tool not found", 404);
    }

    let spec = project.spec;
    let compiledTool: unknown = null;

    if (project.active_version_id) {
      const { data: version } = await (supabase.from("tool_versions") as any)
        .select("tool_spec, compiled_tool")
        .eq("id", project.active_version_id)
        .single();
      if (version?.tool_spec) spec = version.tool_spec;
      if (version?.compiled_tool) compiledTool = version.compiled_tool;
    }

    if (!isToolSystemSpec(spec)) {
      return errorResponse("Invalid tool spec", 422);
    }

    const artifact = isCompiledToolArtifact(compiledTool)
      ? compiledTool
      : buildCompiledToolArtifact(spec);

    // Find the trigger in the spec
    const trigger = (spec.triggers ?? []).find((t: any) => t.id === endpoint.triggerId);
    if (!trigger) {
      return errorResponse("Trigger not found in spec", 404);
    }

    // Dispatch
    const input = { ...payload, ...(trigger.condition ?? {}) };

    if (trigger.actionId) {
      await executeToolAction({
        orgId: endpoint.orgId,
        toolId: endpoint.toolId,
        compiledTool: artifact,
        actionId: trigger.actionId,
        input,
        triggerId: `webhook:${endpoint.id}`,
      });
    } else if (trigger.workflowId) {
      await runWorkflow({
        orgId: endpoint.orgId,
        toolId: endpoint.toolId,
        compiledTool: artifact,
        workflowId: trigger.workflowId,
        input,
        triggerId: `webhook:${endpoint.id}`,
      });
    } else {
      return errorResponse("Trigger has no actionId or workflowId", 400);
    }

    // Update invocation stats
    void incrementInvocationCount(endpoint.id);

    return jsonResponse({ ok: true, status: "dispatched" });
  } catch (err) {
    console.error("[Webhook] Error:", err);
    return errorResponse("Webhook dispatch failed", 500);
  }
}
