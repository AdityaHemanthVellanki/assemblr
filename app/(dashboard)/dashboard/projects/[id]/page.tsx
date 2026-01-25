import { notFound } from "next/navigation";

import { ProjectWorkspace } from "@/components/dashboard/project-workspace";
import { requireOrgMember, requireProjectOrgAccess, canViewDashboards } from "@/lib/permissions";
import { getServerEnv } from "@/lib/env";
import { parseToolSpec } from "@/lib/spec/toolSpec";
import { loadMemory, type MemoryScope } from "@/lib/toolos/memory-store";
import { type ToolBuildLog } from "@/lib/toolos/build-state-machine";
import { ToolLifecycleStateSchema } from "@/lib/toolos/spec";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  getServerEnv();
  const { id: toolId } = await params;

  // 1. Auth & Access
  const { ctx, role } = await requireOrgMember();
  
  if (!canViewDashboards(role)) {
    // Should handle this better (e.g. 403 page), but for now...
    throw new Error("Unauthorized");
  }

  await requireProjectOrgAccess(ctx, toolId);

  const supabase = await createSupabaseServerClient();

  // 2. Fetch Project & Messages
  const projectResPromise = (supabase.from("projects") as any)
    .select(
      "id, spec, active_version_id, org_id, status, error_message"
    )
    .eq("id", toolId)
    .single();

  const messagesRes = await supabase
    .from("chat_messages")
    .select("role, content, metadata")
    .eq("tool_id", toolId)
    .order("created_at", { ascending: true });

  const [projectRes, renderStateRes] = await Promise.all([
    projectResPromise,
    (supabase.from("tool_render_state") as any)
      .select("snapshot, view_spec")
      .eq("tool_id", toolId)
      .eq("org_id", ctx.orgId)
      .single(),
  ]);

  if (projectRes.error) {
    console.error("Project load failed", {
      toolId,
      orgId: ctx.orgId,
      message: projectRes.error.message,
    });
  }
  if (renderStateRes?.error) {
    console.error("Render state load failed", {
      toolId,
      orgId: ctx.orgId,
      message: renderStateRes.error.message,
    });
  }
  if (!projectRes.data) notFound();

  if (messagesRes.error) {
    throw new Error("Failed to load messages");
  }
  if (!messagesRes.data) {
    throw new Error("Failed to load messages");
  }

  // 3. Parse Spec
  let spec = null;
  let specError: string | null = null;
  if (projectRes.data.spec) {
    try {
      if (projectRes.data.active_version_id) {
        const { data: version } = await (supabase.from("tool_versions") as any)
          .select("tool_spec")
          .eq("id", projectRes.data.active_version_id)
          .single();
        const parsed = parseToolSpec(version?.tool_spec ?? projectRes.data.spec);
        if (parsed.ok) {
          spec = parsed.spec;
        } else {
          specError = parsed.error;
        }
      } else {
        const parsed = parseToolSpec(projectRes.data.spec);
        if (parsed.ok) {
          spec = parsed.spec;
        } else {
          specError = parsed.error;
        }
      }
    } catch (e) {
      console.error("Failed to parse project spec", e);
      // Don't crash, just show empty/error state
    }
  }

  const scope: MemoryScope = { type: "tool_org", toolId, orgId: ctx.orgId };
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
  const normalizedLifecycle = ToolLifecycleStateSchema.safeParse(lifecycleState).success
    ? ToolLifecycleStateSchema.parse(lifecycleState)
    : null;
  const normalizedBuildLogs = Array.isArray(buildLogs)
    ? (buildLogs as ToolBuildLog[])
    : null;
  if (spec && normalizedLifecycle) {
    spec = { ...spec, lifecycle_state: normalizedLifecycle };
  }

  const messages = messagesRes.data.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
    metadata: (m.metadata ?? undefined) as
      | { missing_integration_id?: string; action?: "connect_integration" }
      | undefined,
  }));

  const viewSpecPayload =
    Array.isArray(renderStateRes?.data?.view_spec)
      ? { views: renderStateRes?.data?.view_spec }
      : renderStateRes?.data?.view_spec ?? null;

  return (
    <ProjectWorkspace
      project={{
        id: projectRes.data.id,
        spec,
        spec_error: specError,
        lifecycle_state: normalizedLifecycle,
        build_logs: normalizedBuildLogs,
        status: projectRes.data.status,
        error_message: projectRes.data.error_message,
        view_spec: viewSpecPayload,
        view_ready: Boolean(viewSpecPayload),
        data_snapshot: renderStateRes?.data?.snapshot ?? null,
        data_ready: Boolean(renderStateRes?.data?.snapshot),
      }}
      initialMessages={messages}
      role={role}
    />
  );
}
