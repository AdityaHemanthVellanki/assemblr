import { cookies } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@supabase/ssr";
import { loadMemory, MemoryScope } from "@/lib/toolos/memory-store";
import { FatalInvariantViolation } from "@/lib/core/errors";
import { getLatestToolResult, ToolResultRow } from "@/lib/toolos/materialization";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api/response";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  // Temporary defensive env assertion
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    throw new Error("Supabase env vars missing at runtime");
  }

  try {
    const { toolId } = await params;
    
    // Create local supabase client for this request
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Ignore from server component/route handler
            }
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({
        status: "unauthenticated",
        message: "Session not ready",
        lifecycle: "INIT",
      }, { status: 200 });
    }

    console.log(`[StatusRoute] Lookup toolId: ${toolId}`);

    // FIX: Query "projects" table (as authoritative "tools" table)
    // We select "status" to help derive lifecycle
    // Use Service Role to avoid RLS issues on status checks
    const adminSupabase = createSupabaseAdminClient();
    const { data: project, error: projectError } = await (adminSupabase.from("projects") as any)
      .select("org_id, status")
      .eq("id", toolId)
      .single();

    if (projectError || !project) {
      // If project row doesn't exist, it's truly 404
      return errorResponse("Tool not found", 404);
    }
    
    // Check membership
     const { data: membership } = await adminSupabase
         .from("memberships")
         .select("role")
         .eq("user_id", user.id)
         .eq("org_id", project.org_id)
         .single();
         
     if (!membership) {
          return errorResponse("Unauthorized", 401);
     }

     // FIX: Check tool_results table for authoritative status
     const latestResult = await getLatestToolResult(toolId, project.org_id);
     
     // If execution completed (implied by existence of project/spec) but no result -> FAILED
     // But we need to distinguish "freshly created" vs "run and failed".
     // For now, if no result, it's NOT materialized.
     
     const materialized = latestResult?.status === "MATERIALIZED";
     const recordCount = latestResult?.record_count ?? 0;
     const schemaPresent = !!latestResult?.schema_json;
     const isReady = project.status === "ready" || project.status === "active" || materialized;
     
     let lifecycleState = "CREATED";
     if (isReady) {
         lifecycleState = "READY";
     } else if (latestResult && !materialized) {
         lifecycleState = "FAILED";
     } else if (project.status === "active" || project.status === "ready") {
         // Fallback if result missing but status says ready (shouldn't happen with strict invariant)
         lifecycleState = "READY";
     }

     return Response.json({
       status: "authenticated",
       toolId,
       lifecycle: lifecycleState,
       materialized,
       record_count: recordCount,
       schema_present: schemaPresent,
       is_ready: isReady
     }, { status: 200 });

  } catch (e) {
    return handleApiError(e);
  }
}
