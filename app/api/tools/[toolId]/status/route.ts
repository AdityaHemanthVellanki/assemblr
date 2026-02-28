import { createSupabaseServerClient } from "@/lib/supabase/server";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api/response";
import { loadMemory, type MemoryScope } from "@/lib/toolos/memory-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  try {
    const { toolId } = await params;
    const supabase = await createSupabaseServerClient();
    const { data: authData } = await supabase.auth.getUser();
    const authUser = authData?.user ?? null;
    if (!authUser) {
      return jsonResponse(
        {
          status: "unauthenticated",
          error: null,
          done: false,
          lifecycle_state: null,
          build_logs: null,
          view_ready: false,
          view_spec: null,
          data_ready: false,
          data_snapshot: null,
          data_fetched_at: null,
        },
        { status: 200 },
      );
    }
    // Only fetch lightweight status flags — NOT spec/data_snapshot (100KB+ each)
    const { data: project, error: projectError } = await (supabase.from("projects") as any)
      .select("id, org_id, status, error_message, lifecycle_done, view_ready, data_ready, data_fetched_at")
      .eq("id", toolId)
      .single();

    if (projectError || !project) {
      return errorResponse("Tool not found", 404);
    }

    // Check render state flags (lightweight)
    const { data: renderState } = await (supabase.from("tool_render_state") as any)
      .select("data_ready, view_ready")
      .eq("tool_id", toolId)
      .eq("org_id", project.org_id)
      .maybeSingle();

    const responseDataReady = renderState?.data_ready === true || project.data_ready === true;
    const responseViewReady = renderState?.view_ready === true || project.view_ready === true;
    const terminalStatus = ["MATERIALIZED", "READY", "FAILED"].includes(project.status);
    const done = Boolean(project.lifecycle_done || terminalStatus || responseViewReady || responseDataReady);

    // Only fetch heavy payloads (view_spec, data_snapshot) when done — not during polling
    let responseViewSpec = null;
    let responseSnapshot = null;
    let responseBuildLogs = null;
    let resolvedLifecycleState = null;

    if (done) {
      // Fetch large columns only once when complete
      const { data: fullRender } = await (supabase.from("tool_render_state") as any)
        .select("snapshot, view_spec")
        .eq("tool_id", toolId)
        .eq("org_id", project.org_id)
        .maybeSingle();

      if (fullRender) {
        responseSnapshot = fullRender.snapshot ?? null;
        responseViewSpec = fullRender.view_spec ?? null;
      }

      // Fallback to project columns if render state doesn't have them
      if (!responseSnapshot || !responseViewSpec) {
        const { data: projectFull } = await (supabase.from("projects") as any)
          .select("data_snapshot, view_spec")
          .eq("id", toolId)
          .single();
        if (projectFull) {
          responseSnapshot = responseSnapshot ?? projectFull.data_snapshot ?? null;
          responseViewSpec = responseViewSpec ?? projectFull.view_spec ?? null;
        }
      }
    }

    // Only fetch build logs/lifecycle when not yet done (for progress display)
    if (!done) {
      const scope: MemoryScope = { type: "tool_org", toolId, orgId: project.org_id };
      const lifecycleState = await loadMemory({
        scope,
        namespace: "tool_builder",
        key: "lifecycle_state",
      });
      const buildLogs = await loadMemory({
        scope,
        namespace: "tool_builder",
        key: "build_logs",
      });
      resolvedLifecycleState =
        typeof lifecycleState === "string"
          ? lifecycleState
          : (lifecycleState as any)?.state ?? null;
      const rawLogs = Array.isArray(buildLogs)
        ? buildLogs
        : (buildLogs as any)?.logs ?? null;
      responseBuildLogs = Array.isArray(rawLogs) ? rawLogs : null;
    }

    const response = jsonResponse({
      status: project.status,
      error: project.error_message ?? null,
      done,
      lifecycle_state: resolvedLifecycleState,
      build_logs: responseBuildLogs,
      view_ready: responseViewReady,
      view_spec: responseViewSpec,
      data_ready: responseDataReady,
      data_snapshot: responseSnapshot,
      data_fetched_at: project.data_fetched_at ?? null,
    });
    // Cache: stable (done) results cached longer; in-progress cached briefly
    response.headers.set(
      "Cache-Control",
      done
        ? "private, max-age=15, stale-while-revalidate=30"
        : "private, max-age=2, stale-while-revalidate=5",
    );
    return response;

  } catch (e) {
    return handleApiError(e);
  }
}
