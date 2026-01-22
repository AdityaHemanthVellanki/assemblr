import { NextResponse } from "next/server";
import { requireOrgMember, requireProjectOrgAccess } from "@/lib/auth/permissions.server";
// import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isToolSystemSpec } from "@/lib/toolos/spec";
import { validateMRT } from "@/lib/toolos/mrt";
import { executeToolAction } from "@/lib/toolos/runtime";
import { loadMemory, MemoryScope } from "@/lib/toolos/memory-store";
import { buildCompiledToolArtifact } from "@/lib/toolos/compiler";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api/response";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  try {
    const { toolId } = await params;
    const { ctx } = await requireOrgMember();
    await requireProjectOrgAccess(ctx, toolId);
    // Use Admin Client for activation logic to ensure consistency
    const supabase = createSupabaseAdminClient();

    const { data: project, error } = await (supabase.from("projects") as any)
      .select("spec, active_version_id, is_activated")
      .eq("id", toolId)
      .eq("org_id", ctx.orgId)
      .single();

    if (error || !project?.spec) {
      return errorResponse("Tool not found", 404);
    }

    let spec = project.spec;
    let compiledTool: any = null;
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

    const scope: MemoryScope = { type: "tool_org", toolId, orgId: ctx.orgId };
    const lifecycleState = await loadMemory({
      scope,
      namespace: "tool_builder",
      key: "lifecycle_state",
    });

    const validation = validateMRT(spec, true, lifecycleState as any);
    if (!validation.runnable) {
      return errorResponse("Tool is not runnable", 422, validation.errors);
    }

    // 1. Initial Fetch
    if (!compiledTool) {
      compiledTool = buildCompiledToolArtifact(spec);
    }

    const initialFetch = spec.initialFetch;
    if (initialFetch) {
      await executeToolAction({
        orgId: ctx.orgId,
        toolId,
        compiledTool,
        actionId: initialFetch.actionId,
        input: { limit: initialFetch.limit },
        userId: ctx.userId,
        triggerId: "activation",
      });
    } else {
      // Fallback: Find first read action
      const readAction = spec.actions.find((a) => a.type === "READ");
      if (readAction) {
        await executeToolAction({
          orgId: ctx.orgId,
          toolId,
          compiledTool,
          actionId: readAction.id,
          input: {},
          userId: ctx.userId,
          triggerId: "activation_fallback",
        });
      }
    }

    // 2. Mark Activated
    const { error: updateError } = await (supabase.from("projects") as any)
      .update({ 
        spec: { ...spec, is_activated: true }
        // is_activated: true // REMOVED: Schema mismatch
      })
      .eq("id", toolId)
      .eq("org_id", ctx.orgId);

    if (updateError) {
      throw updateError;
    }

    return jsonResponse({ activated: true });
  } catch (e) {
    return handleApiError(e);
  }
}
