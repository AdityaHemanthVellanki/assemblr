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
      .select("status, error_message")
      .eq("id", toolId)
      .single();

    if (projectError || !project) {
      return errorResponse("Tool not found", 404);
    }

     return jsonResponse({
       status: project.status,
       error: project.error_message ?? null,
     });

  } catch (e) {
    return handleApiError(e);
  }
}
