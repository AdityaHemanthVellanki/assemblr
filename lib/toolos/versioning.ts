import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ToolSystemSpec } from "@/lib/toolos/spec";
import { createHash } from "crypto";

type ToolVersionRow = {
  id: string;
  tool_id: string;
  org_id: string;
  created_by?: string | null;
  status: "draft" | "active" | "archived";
  name: string;
  purpose: string;
  tool_spec: ToolSystemSpec;
  compiled_tool: Record<string, any>;
  intent_schema?: Record<string, any> | null;
  build_hash?: string;
  diff?: Record<string, any> | null;
};

async function validateToolVersionsSchema(supabase: ReturnType<typeof createSupabaseAdminClient>) {
  const { error } = await (supabase.from("tool_versions") as any)
    .select("id, tool_id, org_id, status, name, purpose, tool_spec, compiled_tool, intent_schema, build_hash, diff, created_by")
    .limit(1);
  if (error) {
    throw new Error(
      `tool_versions schema invalid: ${error.message}. Run migration 20260122130000_fix_tool_versions_schema.sql and reload schema cache.`
    );
  }
}

export async function createToolVersion(params: {
  orgId: string;
  toolId: string;
  userId?: string | null;
  spec: ToolSystemSpec;
  compiledTool: Record<string, any>;
  baseSpec?: ToolSystemSpec | null;
}) {
  if (!params.spec || Object.keys(params.spec).length === 0) {
    throw new Error("Cannot create tool version: Spec is empty or null");
  }
  // Enforce "Fix 3: tool_versions write order" - Spec must be finalized
  if (!params.spec.name || !params.spec.purpose) {
     throw new Error("Cannot create tool version: Spec is incomplete (missing name/purpose)");
  }
  // Hard Assertions for Canonical Ownership
  if (!params.orgId) throw new Error("Cannot create tool version: orgId is required");
  if (!params.toolId) throw new Error("Cannot create tool version: toolId is required");

  const supabase = createSupabaseAdminClient();
  const diff = params.baseSpec ? diffSpecs(params.baseSpec, params.spec) : null;
  const buildHash =
    typeof (params.compiledTool as any)?.specHash === "string"
      ? (params.compiledTool as any).specHash
      : createHash("sha256").update(JSON.stringify(params.spec)).digest("hex");

  const payload: any = {
    tool_id: params.toolId,
    org_id: params.orgId,
    status: "draft",
    name: params.spec.name,
    purpose: params.spec.purpose,
    tool_spec: params.spec,
    build_hash: buildHash,
    diff,
    // created_by: params.userId ?? null, // REMOVED: Schema mismatch
    compiled_tool: params.compiledTool,
    intent_schema: (params.compiledTool as any)?.intentSchema ?? null,
  };

  await validateToolVersionsSchema(supabase);

  const { data, error } = await (supabase.from("tool_versions") as any)
    .upsert(payload, { onConflict: "tool_id,build_hash" })
    .select("*")
    .single();

  if (error) {
    throw error;
  }
  return data as ToolVersionRow;
}

export async function promoteToolVersion(params: { toolId: string; versionId: string }) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await (supabase.from("tool_versions") as any)
    .select("tool_spec")
    .eq("id", params.versionId)
    .single();
  if (error || !data) {
    throw new Error("Version not found");
  }
  await (supabase.from("tool_versions") as any)
    .update({ status: "archived" })
    .eq("tool_id", params.toolId)
    .eq("status", "active")
    .neq("id", params.versionId);
  await (supabase.from("projects") as any).update({
    spec: data.tool_spec,
    active_version_id: params.versionId,
  }).eq("id", params.toolId);
  await (supabase.from("tool_versions") as any).update({ status: "active" }).eq("id", params.versionId);
}

export async function getActiveToolSpec(params: { toolId: string }) {
  const supabase = createSupabaseAdminClient();
  const { data: project, error } = await (supabase.from("projects") as any)
    .select("spec, active_version_id")
    .eq("id", params.toolId)
    .single();
  if (error || !project) {
    throw new Error("Tool not found");
  }
  if (project.active_version_id) {
    const { data: version } = await (supabase.from("tool_versions") as any)
      .select("tool_spec")
      .eq("id", project.active_version_id)
      .single();
    if (version?.tool_spec) {
      return version.tool_spec as ToolSystemSpec;
    }
  }
  return project.spec as ToolSystemSpec;
}

function diffSpecs(baseSpec: ToolSystemSpec, nextSpec: ToolSystemSpec) {
  const added = <T>(list: T[], next: T[], getKey: (item: T) => string) => {
    const existing = new Set(list.map(getKey));
    return next.filter((i) => !existing.has(getKey(i))).map(getKey);
  };
  const removed = <T>(list: T[], next: T[], getKey: (item: T) => string) => {
    const nextIds = new Set(next.map(getKey));
    return list.filter((i) => !nextIds.has(getKey(i))).map(getKey);
  };
  return {
    entities_added: added(baseSpec.entities, nextSpec.entities, (e) => e.name),
    entities_removed: removed(baseSpec.entities, nextSpec.entities, (e) => e.name),
    actions_added: added(baseSpec.actions, nextSpec.actions, (a) => a.id),
    actions_removed: removed(baseSpec.actions, nextSpec.actions, (a) => a.id),
    workflows_added: added(baseSpec.workflows, nextSpec.workflows, (w) => w.id),
    workflows_removed: removed(baseSpec.workflows, nextSpec.workflows, (w) => w.id),
    triggers_added: added(baseSpec.triggers, nextSpec.triggers, (t) => t.id),
    triggers_removed: removed(baseSpec.triggers, nextSpec.triggers, (t) => t.id),
    views_added: added(baseSpec.views, nextSpec.views, (v) => v.id),
    views_removed: removed(baseSpec.views, nextSpec.views, (v) => v.id),
  };
}
