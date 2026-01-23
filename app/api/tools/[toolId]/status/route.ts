import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { finalizeToolLifecycle } from "@/lib/toolos/lifecycle";
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
      .select("status, error_message, updated_at, lifecycle_done")
      .eq("id", toolId)
      .single();

    if (projectError || !project) {
      return errorResponse("Tool not found", 404);
    }

    // STRICT: Return DB-backed state only. No timeout inference.
    // The frontend handles polling termination based on READY/FAILED.
    return jsonResponse({
      status: project.status,
      error: project.error_message ?? null,
      done: project.lifecycle_done ?? false,
    });

  } catch (e) {
    return handleApiError(e);
  }
}
