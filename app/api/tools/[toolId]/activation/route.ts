import { z } from "zod";

import { requireOrgMember, requireProjectOrgAccess, requireRole } from "@/lib/auth/permissions.server";
// import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isCompiledToolArtifact } from "@/lib/toolos/compiler";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api/response";

const bodySchema = z.object({
  activated: z.boolean(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  try {
    const { toolId } = await params;
    const { ctx } = await requireOrgMember();
    await requireProjectOrgAccess(ctx, toolId);
    // Use Admin Client for activation state to ensure reliability
    const supabase = createSupabaseAdminClient();
    const { data: project } = await (supabase.from("projects") as any)
      .select("spec")
      .eq("id", toolId)
      .eq("org_id", ctx.orgId)
      .single();

    if (!project) {
      return errorResponse("Tool not found", 404);
    }

    const isActivated = (project.spec as any)?.is_activated === true;
    return jsonResponse({ activated: isActivated });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  try {
    const { toolId } = await params;
    const { ctx } = await requireRole("editor");
    await requireProjectOrgAccess(ctx, toolId);
    const json = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return errorResponse("Invalid body", 400);
    }
    const supabase = createSupabaseAdminClient();
    
    // Fetch current spec to preserve data
    const { data: project } = await (supabase.from("projects") as any)
      .select("spec, active_version_id")
      .eq("id", toolId)
      .eq("org_id", ctx.orgId)
      .single();
      
    if (!project) return errorResponse("Tool not found", 404);

    if (parsed.data.activated) {
      if (!project.active_version_id) {
        return errorResponse("Tool not compiled yet", 409, {
          status: "blocked",
          reason: "Tool not compiled yet",
          action: "Finish compilation before activating",
        });
      }
      const { data: version } = await (supabase.from("tool_versions") as any)
        .select("compiled_tool")
        .eq("id", project.active_version_id)
        .single();
      if (!isCompiledToolArtifact(version?.compiled_tool)) {
        return errorResponse("CompiledTool missing for active version", 409, {
          status: "blocked",
          reason: "CompiledTool missing for active version",
          action: "Recompile the tool to generate a CompiledTool artifact",
        });
      }
    }

    const newSpec = { ...project.spec, is_activated: parsed.data.activated };
    const { error } = await (supabase.from("projects") as any)
      .update({ 
        spec: newSpec
        // is_activated: parsed.data.activated // REMOVED: Schema mismatch
      })
      .eq("id", toolId)
      .eq("org_id", ctx.orgId);

    if (error) {
      return errorResponse("Failed to update activation state", 500);
    }

    return jsonResponse({ activated: parsed.data.activated });
  } catch (e) {
    return handleApiError(e);
  }
}
