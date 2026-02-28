import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { jsonResponse, errorResponse } from "@/lib/api/response";
import { getLatestToolResult } from "@/lib/toolos/materialization";
import { getActiveExecution } from "@/lib/toolos/executions";

function withCache(response: NextResponse, maxAge: number = 10) {
  response.headers.set("Cache-Control", `private, max-age=${maxAge}, stale-while-revalidate=15`);
  return response;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ toolId: string }> }
) {
  try {
    const { toolId } = await params;
    // Auth check uses server client (with cookies)
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return errorResponse("Unauthorized", 401);
    }

    // Verify tool ownership/access via server client (RLS)
    const { data: tool, error: toolError } = await supabase
      .from("projects")
      .select("id, org_id, status")
      .eq("id", toolId)
      .single();

    if (toolError || !tool) {
      return errorResponse("Tool not found", 404);
    }

    // Use admin client for result query to bypass RLS on tool_results
    const result = await getLatestToolResult(toolId, tool.org_id);

    if (!result) {
      // Check if the tool is actually materialized but just has no data (e.g. monitoring/alert tool)
      if (tool.status === "MATERIALIZED" || tool.status === "READY") {
        return withCache(jsonResponse({
          ok: true,
          data: null,
          status: "ready_no_data"
        }), 30);
      }

      // Tool exists but no result yet — return structured pending with build progress
      // Short cache for pending status since it changes frequently
      const activeExec = await getActiveExecution(toolId);
      return withCache(jsonResponse({
        ok: true,
        data: null,
        status: "pending",
        build_steps: activeExec?.buildSteps ?? [],
      }), 2);
    }

    if (result.status === "FAILED") {
      return withCache(jsonResponse({
        ok: true,
        data: result,
        status: "error"
      }), 30);
    }

    // Materialized results are stable — cache longer
    return withCache(jsonResponse({
      ok: true,
      data: result,
      status: "materialized"
    }), 30);

  } catch (error) {
    console.error("[ToolResult] Error:", error);
    return errorResponse("Internal Server Error", 500);
  }
}
