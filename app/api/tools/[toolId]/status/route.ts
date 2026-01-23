import { createSupabaseServerClient } from "@/lib/supabase/server";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api/response";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  try {
    const { toolId } = await params;
    const supabase = await createSupabaseServerClient();
    const { data: project, error: projectError } = await (supabase.from("projects") as any)
      .select("id, org_id, spec, active_version_id, status, error_message, updated_at, lifecycle_done, view_ready, view_spec, data_snapshot, data_ready, data_fetched_at, finalized_at, finalizing")
      .eq("id", toolId)
      .single();

    if (projectError || !project) {
      return errorResponse("Tool not found", 404);
    }

    console.log("[STATUS] Reading flags for toolId:", toolId);
    const { data: renderState } = await (supabase.from("tool_render_state") as any)
      .select("snapshot, view_spec")
      .eq("tool_id", toolId)
      .eq("org_id", project.org_id)
      .single();

    const snapshot = renderState?.snapshot ?? null;
    const responseSnapshot =
      snapshot && typeof snapshot === "object"
        ? ((snapshot as any).integrations ?? snapshot)
        : null;
    const responseViewSpec = renderState?.view_spec ?? null;

    console.log("[STATUS]", { toolId, data_ready: project.data_ready, view_ready: project.view_ready });

    return jsonResponse({
      status: project.status,
      error: project.error_message ?? null,
      done: project.lifecycle_done ?? Boolean(project.view_ready && project.data_ready),
      view_ready: Boolean(responseViewSpec),
      view_spec: responseViewSpec,
      data_ready: Boolean(responseSnapshot),
      data_snapshot: responseSnapshot,
      data_fetched_at: project.data_fetched_at ?? null,
    });

  } catch (e) {
    return handleApiError(e);
  }
}
