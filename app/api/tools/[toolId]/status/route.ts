import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@supabase/ssr";
import { loadMemory, MemoryScope } from "@/lib/toolos/memory-store";
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
      .select("org_id")
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

     // We already fetched project above with admin client
     // We need spec and active_version_id though
     const { data: fullProject } = await (adminSupabase.from("projects") as any)
       .select("spec, active_version_id")
       .eq("id", toolId)
       .single();
 
     if (!fullProject) return errorResponse("Tool not found", 404);
 
     const status = (fullProject.spec as any)?.status || "draft";
     const isActivated = !!fullProject.active_version_id;
 
     const scope: MemoryScope = { type: "tool_org", toolId, orgId: project.org_id };
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
    
    if (project.status === "error") {
      lifecycle = "ERROR";
    } else if (fullProject.spec?.is_activated) {
      lifecycle = "RUNNING";
    } else if (lifecycle === "ACTIVE") {
      // If ready but not activated, it's waiting for activation
      lifecycle = "READY_TO_ACTIVATE";
    }

    // FIX: Calculate real data stats
    const spec = fullProject.spec as any;
    let recordsFetched = 0;
    let schemaFieldsCount = 0;
    let lastFetchAt: number | null = null;
    let schemaPreview: any[] = [];

    if (spec?.entities) {
        schemaFieldsCount = spec.entities.reduce((acc: number, e: any) => acc + (e.fields?.length || 0), 0);
        schemaPreview = spec.entities.map((e: any) => ({
            name: e.name,
            fields: e.fields?.length || 0
        }));
    }

    if (spec?.actions) {
         const readActions = spec.actions.filter((a: any) => 
            a.type === "READ" || 
            (a.id && (a.id.includes("list") || a.id.includes("search")))
         );
         
         // Parallel fetch for speed
         await Promise.all(readActions.map(async (action: any) => {
             try {
                 const cached = await loadMemory({
                     scope,
                     namespace: "data_cache",
                     key: action.id
                 });
                 if (cached && (cached as any).data) {
                     const data = (cached as any).data;
                     const count = Array.isArray(data) ? data.length : (data ? 1 : 0);
                     recordsFetched += count;
                     
                     const ts = (cached as any).timestamp;
                     if (ts && (!lastFetchAt || ts > lastFetchAt)) {
                         lastFetchAt = ts;
                     }
                 }
             } catch (e) {
                 // Ignore cache read errors
             }
         }));
    }

    // If we have data but lifecycle says INIT, bump it? 
    // No, trust the state machine, but return the stats.

    return jsonResponse({
      lifecycle,
      lastError,
      isActivated: fullProject.spec?.is_activated === true,
      stats: {
          records_fetched: recordsFetched,
          schema_fields: schemaFieldsCount,
          last_fetch_at: lastFetchAt ? new Date(lastFetchAt).toISOString() : null,
          schema_preview: schemaPreview
      }
    });
  } catch (e) {
    return handleApiError(e);
  }
}
