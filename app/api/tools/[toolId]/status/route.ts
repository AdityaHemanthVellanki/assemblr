import { NextResponse } from "next/server";
import { cookies } from "next/headers";
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

    const { data: project, error } = await (supabase.from("projects") as any)
      .select("is_activated, spec, active_version_id, org_id")
      .eq("id", toolId)
      .single();

    if (error || !project) {
      return errorResponse("Tool not found", 404);
    }

    // Verify access (read-only is fine, but must be org member)
    const { data: membership } = await (supabase.from("organization_members") as any)
      .select("role")
      .eq("org_id", project.org_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return errorResponse("Unauthorized", 403);
    }

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
    if (project.is_activated) {
      lifecycle = "RUNNING";
    } else if (lifecycle === "ACTIVE") {
      // If ready but not activated, it's waiting for activation
      lifecycle = "READY_TO_ACTIVATE";
    }

    return jsonResponse({
      lifecycle,
      lastError,
      isActivated: project.is_activated,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
