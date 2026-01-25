import { requireOrgMember, requireProjectOrgAccess } from "@/lib/permissions";
// import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { executeToolAction } from "@/lib/toolos/runtime";
import { runWorkflow } from "@/lib/toolos/workflow-engine";
import { isCompiledToolArtifact } from "@/lib/toolos/compiler";
import { isToolSystemSpec } from "@/lib/toolos/spec";
import { getLatestToolResult, materializeToolOutput } from "@/lib/toolos/materialization";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api/response";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ toolId: string; triggerId: string }> },
) {
  try {
    const { toolId, triggerId } = await params;
    const { ctx } = await requireOrgMember();
    await requireProjectOrgAccess(ctx, toolId);
    // Use admin client for runtime state management
    const supabase = createSupabaseAdminClient();

    // Resolve project spec
    const { data: project } = await (supabase.from("projects") as any)
      .select("spec, active_version_id")
      .eq("id", toolId)
      .single();

  if (!project?.spec) {
    return errorResponse("Tool not found", 404);
  }
  // Check for previous result, but don't block triggers if not present (triggers might be the first run)
  const previousResult = await getLatestToolResult(toolId, ctx.orgId);
  
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

  const trigger = spec.triggers.find((t) => t.id === triggerId);
  if (!trigger) {
    return errorResponse("Trigger not found", 404);
  }

  if (trigger.actionId) {
    if (!isCompiledToolArtifact(compiledTool)) {
      return errorResponse("CompiledTool not found for active version", 400, {
        status: "blocked",
        reason: "CompiledTool not found for active version",
        action: "Recompile the tool to generate a CompiledTool artifact",
      });
    }
    const action = spec.actions.find((a) => a.id === trigger.actionId);
    if (!action) {
      return errorResponse("Action not found", 404);
    }

    const result = await executeToolAction({
      orgId: ctx.orgId,
      toolId,
      compiledTool,
      actionId: trigger.actionId,
      input: trigger.condition ?? {},
      userId: ctx.userId,
      triggerId: trigger.id,
    });

    // Materialize Output
    await materializeToolOutput({
      toolId,
      orgId: ctx.orgId,
      spec,
      actionOutputs: [{ action, output: result.output }],
      previousRecords: previousResult?.records_json ?? null,
    });

    return jsonResponse({ status: "started" });
  }

  if (trigger.workflowId) {
    if (!isCompiledToolArtifact(compiledTool)) {
      return errorResponse("CompiledTool not found for active version", 400, {
        status: "blocked",
        reason: "CompiledTool not found for active version",
        action: "Recompile the tool to generate a CompiledTool artifact",
      });
    }
    await runWorkflow({
      orgId: ctx.orgId,
      toolId,
      compiledTool,
      workflowId: trigger.workflowId,
      input: trigger.condition ?? {},
      triggerId: trigger.id,
    });
    return jsonResponse({ status: "started" });
  }

    return errorResponse("Trigger has no action or workflow", 400);
  } catch (e) {
    return handleApiError(e);
  }
}
