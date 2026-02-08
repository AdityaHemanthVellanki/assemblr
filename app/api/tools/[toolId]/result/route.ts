import { createSupabaseServerClient } from "@/lib/supabase/server";
import { jsonResponse, errorResponse } from "@/lib/api/response";
import { getLatestToolResult } from "@/lib/toolos/materialization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ toolId: string }> }
) {
  try {
    const { toolId } = await params;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return errorResponse("Unauthorized", 401);
    }

    // Verify tool ownership/access
    const { data: tool, error: toolError } = await supabase
      .from("projects")
      .select("id, org_id")
      .eq("id", toolId)
      .single();

    if (toolError || !tool) {
      return errorResponse("Tool not found", 404);
    }

    const result = await getLatestToolResult(toolId, tool.org_id);

    if (!result) {
      // Check if the tool is actually READY but just has no data (e.g. monitoring/alert tool)
      const { data: project } = await supabase
        .from("projects")
        .select("status")
        .eq("id", toolId)
        .single();

      if (project?.status === "READY") {
        return jsonResponse({
          ok: true,
          data: null,
          status: "ready_no_data"
        });
      }

      return errorResponse("No materialized result found", 404);
    }

    return jsonResponse({
      ok: true,
      data: result,
      status: "materialized"
    });

  } catch (error) {
    console.error("[ToolResult] Error:", error);
    return errorResponse("Internal Server Error", 500);
  }
}
