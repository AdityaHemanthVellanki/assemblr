import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api/response";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  try {
    const { toolId } = await params;
    const adminSupabase = createSupabaseAdminClient();
    const { data: project, error: projectError } = await (adminSupabase.from("projects") as any)
      .select("status, error_message, updated_at, lifecycle_done, view_ready, view_spec, data_snapshot, data_ready, data_fetched_at")
      .eq("id", toolId)
      .single();

    if (projectError || !project) {
      return errorResponse("Tool not found", 404);
    }

    console.log("[STATUS]", { toolId, data_ready: project.data_ready, view_ready: project.view_ready });

    return jsonResponse({
      status: project.status,
      error: project.error_message ?? null,
      done: Boolean(project.view_ready && project.data_ready),
      view_ready: project.view_ready ?? false,
      view_spec: project.view_spec ?? null,
      data_ready: project.data_ready ?? false,
      data_snapshot: project.data_snapshot ?? null,
      data_fetched_at: project.data_fetched_at ?? null,
    });

  } catch (e) {
    return handleApiError(e);
  }
}
