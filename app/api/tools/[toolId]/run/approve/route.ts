import { requireRole } from "@/lib/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildCompiledToolArtifact, isCompiledToolArtifact } from "@/lib/toolos/compiler";
import { isToolSystemSpec, type ToolSystemSpec } from "@/lib/toolos/spec";
import { executeToolAction } from "@/lib/toolos/runtime";
import { logWriteAction } from "@/lib/toolos/write-audit";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

/**
 * POST /api/tools/[toolId]/run/approve
 *
 * Explicitly approves and executes a WRITE/MUTATE/NOTIFY action.
 * Requires EDITOR or OWNER role.
 *
 * Body: { actionId: string, input?: Record<string, any> }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  try {
    const { toolId } = await params;
    const { ctx } = await requireRole("editor");
    const supabase = createSupabaseAdminClient();

    const body = await req.json().catch(() => ({}));
    const actionId = typeof body?.actionId === "string" ? body.actionId : null;
    const input = body?.input && typeof body.input === "object" ? body.input : {};

    if (!actionId) {
      return errorResponse("actionId is required", 400);
    }

    // Load tool spec
    const { data: project, error } = await (supabase.from("projects") as any)
      .select("spec, active_version_id")
      .eq("id", toolId)
      .eq("org_id", ctx.orgId)
      .single();

    if (error || !project?.spec) {
      return errorResponse("Tool not found", 404);
    }

    let spec = project.spec;
    let compiledTool: unknown = null;
    if (project.active_version_id) {
      const { data: version } = await (supabase.from("tool_versions") as any)
        .select("tool_spec, compiled_tool")
        .eq("id", project.active_version_id)
        .single();
      spec = version?.tool_spec ?? spec;
      compiledTool = version?.compiled_tool ?? null;
    }

    if (!isToolSystemSpec(spec)) {
      return errorResponse("Invalid tool spec", 422);
    }

    const compiledArtifact = isCompiledToolArtifact(compiledTool)
      ? compiledTool
      : buildCompiledToolArtifact(spec as ToolSystemSpec);

    // Resolve the action
    const action = compiledArtifact.actions.find((a) => a.id === actionId);
    if (!action) {
      return errorResponse(`Action ${actionId} not found in spec`, 404);
    }

    const isWriteAction =
      action.type === "WRITE" || action.type === "MUTATE" || action.type === "NOTIFY";
    if (!isWriteAction) {
      return errorResponse("Only WRITE/MUTATE/NOTIFY actions require approval", 400);
    }

    // Execute with approval flag
    const startMs = Date.now();
    const result = await executeToolAction({
      orgId: ctx.orgId,
      toolId,
      compiledTool: compiledArtifact,
      actionId,
      input: { ...input, approved: true },
      userId: ctx.userId,
    });
    const durationMs = Date.now() - startMs;

    // Audit log
    void logWriteAction({
      orgId: ctx.orgId,
      userId: ctx.userId,
      toolId,
      actionId,
      actionType: action.type as "WRITE" | "MUTATE" | "NOTIFY",
      integrationId: action.integrationId,
      input,
      output: result.output,
      status: "success",
      durationMs,
    });

    return jsonResponse({
      status: "executed",
      actionId: action.id,
      actionType: action.type,
      output: result.output,
      events: result.events,
      durationMs,
      approvedBy: ctx.userId,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
