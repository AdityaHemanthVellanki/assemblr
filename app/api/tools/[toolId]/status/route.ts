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
      .select("org_id, status, environment_ready")
      .eq("id", toolId)
      .single();

    if (projectError || !project) {
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

     // STRICT SCHEMA CONTRACT: No inference.
     // If status is READY and environment_ready is true, it is ready.
     const isReady = project.status === "READY" && project.environment_ready === true;
     
     return Response.json({
       auth_status: "authenticated", // Renamed to avoid collision
       toolId,
       lifecycle: project.status, // Directly return DB status
       status: project.status, // Return status as "status" property too for consistency
       environment_ready: project.environment_ready ?? false,
       is_ready: isReady
     }, { status: 200 });

  } catch (e) {
    return handleApiError(e);
  }
}
