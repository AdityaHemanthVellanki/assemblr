import { NextResponse } from "next/server";
import { requireOrgMember, requireProjectOrgAccess } from "@/lib/auth/permissions.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadMemory, MemoryScope } from "@/lib/toolos/memory-store";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api/response";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  try {
    const { toolId } = await params;
    const { ctx } = await requireOrgMember();
    await requireProjectOrgAccess(ctx, toolId);
    const supabase = await createSupabaseServerClient();

    const { data: project, error } = await (supabase.from("projects") as any)
      .select("is_activated, spec, active_version_id")
      .eq("id", toolId)
      .eq("org_id", ctx.orgId)
      .single();

    if (error || !project) {
      return errorResponse("Tool not found", 404);
    }

    const scope: MemoryScope = { type: "tool_org", toolId, orgId: ctx.orgId };
    const lifecycleState = await loadMemory({
      scope,
      namespace: "tool_builder",
      key: "lifecycle_state",
    });

    const lastError = await loadMemory({
      scope,
      namespace: "tool_builder",
      key: "last_error",
    });

    // Determine effective lifecycle
    let lifecycle = lifecycleState || "INIT";
    if (project.is_activated) {
      lifecycle = "RUNNING";
    } else if (lifecycle === "ACTIVE") {
      // If ready but not activated, it's waiting for activation
      lifecycle = "READY_TO_ACTIVATE";
    }

    return jsonResponse({
      lifecycle,
      lastError,
      isActivated: project.is_activated,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
