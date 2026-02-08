import { notFound } from "next/navigation";

import { ProjectWorkspace } from "@/components/dashboard/project-workspace";
import { requireOrgMember, requireProjectOrgAccess, canViewDashboards } from "@/lib/permissions";
import { getServerEnv } from "@/lib/env";
import { parseToolSpec } from "@/lib/spec/toolSpec";
import { loadMemory, type MemoryScope } from "@/lib/toolos/memory-store";
import { type ToolBuildLog } from "@/lib/toolos/build-state-machine";
import { ToolLifecycleStateSchema, coerceViewSpecPayload } from "@/lib/toolos/spec";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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
    throw new Error("Unauthorized");
  }

  await requireProjectOrgAccess(ctx, toolId);

  const supabase = await createSupabaseServerClient();

  // 2. Fetch Project & Messages
  const projectResPromise = (supabase.from("projects") as any)
    .select(
      "id, name, description, spec, active_version_id, org_id, status, error_message, view_spec, view_ready, data_snapshot, data_ready"
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
      .select("snapshot, view_spec, data_ready, view_ready")
      .eq("tool_id", toolId)
      .eq("org_id", ctx.orgId)
      .maybeSingle(),
  ]);

  if (projectRes.error) {
    console.error("Project load failed", {
      toolId,
      orgId: ctx.orgId,
      message: projectRes.error.message,
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
    }
  }

  const scope: MemoryScope = { type: "tool_org", toolId, orgId: ctx.orgId };
  const lifecycleState = await loadMemory({
    scope,
    namespace: "tool_builder",
    key: "lifecycle_state",
  });

  const normalizedLifecycle = ToolLifecycleStateSchema.safeParse(lifecycleState).success
    ? ToolLifecycleStateSchema.parse(lifecycleState)
    : null;

  if (spec && normalizedLifecycle) {
    spec = { ...spec, lifecycle_state: normalizedLifecycle };
  }

  const messages = messagesRes.data.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
    metadata: (m.metadata ?? undefined) as any,
  }));

  const rawViewSpec = renderStateRes?.data?.view_spec ?? projectRes.data.view_spec ?? null;
  const viewSpecPayload = rawViewSpec
    ? coerceViewSpecPayload(Array.isArray(rawViewSpec) ? { views: rawViewSpec } : rawViewSpec)
    : null;
  const dataSnapshot = renderStateRes?.data?.snapshot ?? projectRes.data.data_snapshot ?? null;

  return (
    <ProjectWorkspace
      project={{
        id: projectRes.data.id,
        name: projectRes.data.name,
        description: projectRes.data.description || "",
        spec,
        spec_error: specError,
        status: projectRes.data.status,
        error_message: projectRes.data.error_message,
        view_spec: viewSpecPayload,
        data_snapshot: dataSnapshot,
        org_id: projectRes.data.org_id
      }}
      initialMessages={messages}
      role={role}
      readOnly={role === "viewer"}
    />
  );
}
