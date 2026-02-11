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
    const { data: project, error: projectError } = await (supabase.from("projects") as any)
      .select("id, org_id, spec, active_version_id, status, error_message, updated_at, lifecycle_done, view_ready, view_spec, data_snapshot, data_ready, data_fetched_at, finalized_at, finalizing")
      .eq("id", toolId)
      .single();

    if (projectError || !project) {
      return errorResponse("Tool not found", 404);
    }

    console.log("[STATUS] Reading flags for toolId:", toolId);
    console.error("[STATUS CONTEXT]", {
      toolId,
      supabaseUrl: process.env.SUPABASE_URL ?? null,
      schema: "public",
      client: "server",
    });
    const { data: renderState } = await (supabase.from("tool_render_state") as any)
      .select("snapshot, view_spec, data_ready, view_ready")
      .eq("tool_id", toolId)
      .eq("org_id", project.org_id)
      .maybeSingle();

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

    const resolvedLifecycleState =
      typeof lifecycleState === "string"
        ? lifecycleState
        : (lifecycleState as any)?.state ?? null;
    const resolvedBuildLogs = Array.isArray(buildLogs)
      ? buildLogs
      : (buildLogs as any)?.logs ?? null;

    const responseSnapshot = renderState?.snapshot ?? project.data_snapshot ?? null;
    const responseViewSpec = renderState?.view_spec ?? project.view_spec ?? null;
    const responseDataReady = renderState?.data_ready === true || project.data_ready === true;
    const responseViewReady = renderState?.view_ready === true || project.view_ready === true;
    const responseBuildLogs = Array.isArray(resolvedBuildLogs) ? resolvedBuildLogs : null;
    const terminalStatus = ["MATERIALIZED", "READY", "FAILED"].includes(project.status);
    const done = Boolean(project.lifecycle_done || terminalStatus || responseViewReady || responseDataReady);

    console.log("[STATUS]", { toolId, data_ready: project.data_ready, view_ready: project.view_ready });

    return jsonResponse({
      status: project.status,
      error: project.error_message ?? null,
      done,
      lifecycle_state: resolvedLifecycleState ?? null,
      build_logs: responseBuildLogs,
      view_ready: responseViewReady,
      view_spec: responseViewSpec,
      data_ready: responseDataReady,
      data_snapshot: responseSnapshot,
      data_fetched_at: project.data_fetched_at ?? null,
    });

  } catch (e) {
    return handleApiError(e);
  }
}
