import { requireOrgMember } from "@/lib/permissions";
// import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { executeToolAction } from "@/lib/toolos/runtime";
import { runWorkflow } from "@/lib/toolos/workflow-engine";
import { isCompiledToolArtifact } from "@/lib/toolos/compiler";
import { isToolSystemSpec } from "@/lib/toolos/spec";
import { getLatestToolResult } from "@/lib/toolos/materialization";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ toolId: string; runId: string }> },
) {
  try {
    const { toolId, runId } = await params;
    const { ctx } = await requireOrgMember();
    // FIX: Use Admin Client to ensure access to execution internals without RLS friction
    // The user's permission is already validated by requireOrgMember
    const supabase = createSupabaseAdminClient();

    const { data: project } = await (supabase.from("projects") as any)
      .select("spec, active_version_id")
      .eq("id", toolId)
      .eq("org_id", ctx.orgId)
      .single();

    if (!project?.spec) {
      return errorResponse("Tool not found", 404);
    }
    const result = await getLatestToolResult(toolId, ctx.orgId);
    if (!result || result.status !== "MATERIALIZED") {
      return errorResponse("Tool not materialized", 409, {
        status: "failed",
        reason: "No materialized result"
      });
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
      return errorResponse("Tool spec invalid", 422);
    }

    const { data: run } = await (supabase.from("execution_runs") as any)
      .select("*")
      .eq("id", runId)
      .eq("tool_id", toolId)
      .eq("org_id", ctx.orgId)
      .single();

    if (!run) {
      return errorResponse("Run not found", 404);
    }

    if (run.action_id) {
      if (!isCompiledToolArtifact(compiledTool)) {
        return errorResponse(
          "CompiledTool not found for active version",
          400,
          { action: "Recompile the tool to generate a CompiledTool artifact" }
        );
      }
      await executeToolAction({
        orgId: ctx.orgId,
        toolId,
        compiledTool,
        actionId: run.action_id,
        input: run.input ?? {},
        userId: ctx.userId,
        triggerId: `retry:${run.id}`,
      });
      return jsonResponse({ status: "retry_started" });
    }

    if (run.workflow_id) {
      if (!isCompiledToolArtifact(compiledTool)) {
        return errorResponse(
          "CompiledTool not found for active version",
          400,
          { action: "Recompile the tool to generate a CompiledTool artifact" }
        );
      }
      await runWorkflow({
        orgId: ctx.orgId,
        toolId,
        compiledTool,
        workflowId: run.workflow_id,
        input: run.input ?? {},
        triggerId: `retry:${run.id}`,
      });
      return jsonResponse({ status: "retry_started" });
    }

    return errorResponse("No action or workflow to retry", 400);
  } catch (e) {
    return handleApiError(e);
  }
}
