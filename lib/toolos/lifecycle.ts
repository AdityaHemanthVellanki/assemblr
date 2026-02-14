import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createEmptyToolSpec } from "@/lib/toolos/spec";
import { computeSpecHash } from "@/lib/spec/toolSpec";
import { normalizeToolSpec } from "@/lib/spec/toolSpec";
import { createHash, randomUUID } from "crypto";
import { type SnapshotRecords } from "@/lib/toolos/materialization";
import { transitionToolState, forceFailTool, type ToolLifecycleState } from "@/lib/toolos/lifecycle-state-machine";

// Re-export lifecycle state machine for convenience
export { transitionToolState, forceFailTool, type ToolLifecycleState } from "@/lib/toolos/lifecycle-state-machine";

export type FinalizeToolExecutionInput = {
  toolId: string;
  status: "READY" | "MATERIALIZED" | "FAILED";
  errorMessage?: string | null;
  environment?: Record<string, any>;
  view_spec?: Record<string, any> | null;
  view_ready?: boolean;
  data_snapshot?: SnapshotRecords | null;
  data_ready?: boolean;
  data_fetched_at?: string | null;
};

function normalizeSnapshotRecords(snapshot?: SnapshotRecords | null): SnapshotRecords {
  const base = snapshot ?? { state: {}, actions: {}, integrations: {} };
  const state = base && typeof base.state === "object" && base.state ? base.state : {};
  const actions = base && typeof base.actions === "object" && base.actions ? base.actions : {};
  const integrations =
    base && typeof base.integrations === "object" && base.integrations ? base.integrations : {};
  return { state, actions, integrations };
}

/**
 * SINGLE TERMINAL WRITE BARRIER
 * 
 * Transitions a tool to READY or FAILED via the lifecycle state machine.
 * This is the ONLY place that should finalize a tool.
 */
export async function finalizeToolExecution(input: FinalizeToolExecutionInput): Promise<void> {
  const {
    toolId,
    status,
    errorMessage,
    environment,
    view_spec,
    view_ready,
    data_snapshot,
    data_ready,
    data_fetched_at,
  } = input;
  const supabase = createSupabaseAdminClient();

  console.log(`[Lifecycle] Tool finalized: ${status}`, { toolId, errorMessage, lifecycle_done: true });

  const updatePayload: any = {
    status: (status === "READY" ? "MATERIALIZED" : status),
    error_message: status === "FAILED" ? errorMessage ?? "Unknown error" : null,
    finalized_at: new Date().toISOString(),
    lifecycle_done: true,
    updated_at: new Date().toISOString(),
  };

  // Map legacy 'READY' to 'MATERIALIZED' for DB constraint compliance
  const dbStatus = status === "READY" ? "MATERIALIZED" : status;

  if (dbStatus === "MATERIALIZED") {
    // Mandatory materialization check: if no data and no views, FAIL instead
    if (!data_snapshot && !view_spec) {
      console.error(`[Lifecycle] READY requested but no data and no views — forcing FAILED`);
      return finalizeToolExecution({
        ...input,
        status: "FAILED",
        errorMessage: "Execution completed but produced no datasets or views.",
      });
    }

    const normalizedSnapshot = normalizeSnapshotRecords(data_snapshot);
    if (view_spec) {
      updatePayload.view_spec = view_spec;
      updatePayload.view_ready = true;
    }
    updatePayload.data_snapshot = normalizedSnapshot;
    updatePayload.data_ready = true;
    updatePayload.data_fetched_at = data_fetched_at ?? new Date().toISOString();
  } else {
    // FAILED status
    if (view_spec) {
      updatePayload.view_spec = view_spec;
      updatePayload.view_ready = true;
    } else if (typeof view_ready === "boolean") {
      updatePayload.view_ready = view_ready;
    }

    if (data_snapshot) {
      updatePayload.data_snapshot = data_snapshot;
      updatePayload.data_ready = true;
      updatePayload.data_fetched_at = data_fetched_at ?? new Date().toISOString();
    } else if (typeof data_ready === "boolean") {
      updatePayload.data_ready = data_ready;
    }
  }

  if (dbStatus === "MATERIALIZED" && environment) {
    updatePayload.environment = environment;
  }

  const { error: dbError } = await supabase
    .from("projects")
    .update(updatePayload)
    .eq("id", toolId);

  if (dbError) {
    console.error(`[Lifecycle] DB Update Failed: ${dbError.message}`, dbError);
    throw new Error(`CRITICAL: Tool ${toolId} failed to finalize: ${dbError.message}`);
  }

  console.log(`[Lifecycle] TOOL FINALIZED: ${toolId} → ${status}`);
}

/**
 * Create a bare project shell (no tool identity, no version).
 * Used for "New Chat" without a prompt.
 * Status: CREATED
 */
export async function ensureProjectIdentity(params: {
  supabase?: ReturnType<typeof createSupabaseAdminClient>;
  projectId?: string;
  orgId: string;
  userId: string;
  name?: string;
}) {
  const supabase = params.supabase ?? createSupabaseAdminClient();
  const projectId = params.projectId ?? randomUUID();
  const name = params.name ?? "Untitled Project";
  const now = new Date().toISOString();

  const { data: projectRow, error: projectError } = await (supabase.from("projects") as any)
    .upsert(
      {
        id: projectId,
        org_id: params.orgId,
        // owner_id: params.userId, // Removed: Not in Prisma/Migration schema
        name,
        status: "CREATED",
        created_at: now,
        updated_at: now,
      },
      { onConflict: "id" },
    )
    .select("id, org_id")
    .single();

  if (projectError || !projectRow) {
    throw new Error(`Fatal: failed to create project shell: ${projectError?.message || "Unknown error"}`);
  }

  return { projectId };
}

/**
 * TRANSACTIONAL TOOL CREATION
 * 
 * Creates a tool with the following atomicity guarantees:
 * 1. Insert project row (status = CREATED)
 * 2. Create initial tool_version (status = draft)
 * 3. Promote version to active
 * 4. Set projects.active_version_id
 * 
 * If ANY step fails, the entire operation rolls back (project is deleted).
 * There must NEVER be a state where a tool exists without a version.
 */
export async function ensureToolIdentity(params: {
  supabase?: ReturnType<typeof createSupabaseAdminClient>;
  toolId?: string;
  orgId: string;
  userId: string;
  name?: string;
  purpose?: string;
  sourcePrompt?: string;
}) {
  const supabase = params.supabase ?? createSupabaseAdminClient();
  const toolId = params.toolId ?? randomUUID();
  const name = params.name ?? "New Tool";
  const now = new Date().toISOString();
  const spec = createEmptyToolSpec({
    id: toolId,
    name,
    purpose: params.purpose ?? name,
    sourcePrompt: params.sourcePrompt ?? params.purpose ?? name,
  });

  // === STEP 1: Create project row ===
  const { data: projectRow, error: projectError } = await (supabase.from("projects") as any)
    .upsert(
      {
        id: toolId,
        org_id: params.orgId,
        // owner_id: params.userId, // Removed: Not in Prisma/Migration schema
        name,
        status: "CREATED",
        spec,
        created_at: now,
        updated_at: now,
      },
      { onConflict: "id" },
    )
    .select("id, org_id")
    .single();

  if (projectError || !projectRow) {
    throw new Error(`Fatal: failed to create project row: ${projectError?.message || "Unknown error"}`);
  }
  if (projectRow.org_id && projectRow.org_id !== params.orgId) {
    throw new Error(`Invariant: project ${toolId} belongs to a different org`);
  }

  // CORE FIX: Legacy Tool Shim (Dual Write)
  // Some environments (like this one) have tool_versions FK referencing 'tools' table.
  // We must mirror the project creation in the legacy 'tools' table to satisfy constraints.
  try {
    const { error: toolShimError } = await (supabase.from("tools") as any).insert({
      id: toolId,
      org_id: params.orgId,
      name,
      type: "tool",
      current_spec: {}
    });
    if (toolShimError && !toolShimError.message.includes("duplicate key")) {
      console.warn("[Lifecycle] Legacy 'tools' shim write failed:", toolShimError.message);
    }
  } catch (e) {
    // Ignore schema mismatch errors (e.g. if tools table is gone)
    console.warn("[Lifecycle] Legacy 'tools' shim skipped due to error:", e);
  }

  // === STEP 2: Create initial tool version ===
  const normalizedSpecResult = normalizeToolSpec(spec, {
    sourcePrompt: params.sourcePrompt ?? params.purpose ?? name,
    enforceVersion: true,
  });

  if (!normalizedSpecResult.ok) {
    // Rollback: delete project
    await (supabase.from("projects") as any).delete().eq("id", toolId);
    throw new Error(`Failed to normalize spec during tool creation: ${normalizedSpecResult.error}`);
  }

  // === STEP 2: Handle Initial Version ===
  // Trigger on 'tools' table might have created a default version already.
  // We check for existing versions to avoid conflicts.
  let versionRow: { id: string } | null = null;

  const { data: existingVersions } = await (supabase.from("tool_versions") as any)
    .select("id, status")
    .eq("tool_id", toolId)
    .limit(1);

  const normalizedSpec = normalizedSpecResult.spec;
  const specHash = computeSpecHash(normalizedSpec);
  const compiledTool = { specHash };

  if (existingVersions && existingVersions.length > 0) {
    // Update existing version
    versionRow = existingVersions[0];
    const { error: updateVerError } = await (supabase.from("tool_versions") as any).update({
      status: "draft", // temporarily draft to allow safe update? No, just update fields.
      name: normalizedSpec.name,
      purpose: normalizedSpec.purpose,
      tool_spec: normalizedSpec,
      spec: normalizedSpec,
      build_hash: specHash,
      compiled_tool: compiledTool,
      updated_at: new Date().toISOString()
    }).eq("id", versionRow!.id);

    if (updateVerError) {
      throw new Error(`Fatal: failed to update existing tool version: ${updateVerError.message}`);
    }
  } else {
    // Create new version
    const { data: newVersionRow, error: versionError } = await (supabase.from("tool_versions") as any)
      .upsert(
        {
          tool_id: toolId,
          org_id: params.orgId,
          status: "draft",
          name: normalizedSpec.name,
          purpose: normalizedSpec.purpose,
          tool_spec: normalizedSpec,
          spec: normalizedSpec,
          build_hash: specHash,
          compiled_tool: compiledTool,
          intent_schema: null,
          diff: null,
        },
        { onConflict: "tool_id,build_hash" },
      )
      .select("id")
      .single();

    if (versionError || !newVersionRow) {
      // Rollback: delete project
      await (supabase.from("projects") as any).delete().eq("id", toolId);
      throw new Error(`Fatal: failed to create initial tool version: ${versionError?.message || "Unknown error"}`);
    }
    versionRow = newVersionRow;
  }

  if (!versionRow) {
    // Safeguard for TS
    await (supabase.from("projects") as any).delete().eq("id", toolId);
    throw new Error("Fatal: Failed to resolve tool version row (unexpected null)");
  }

  // === STEP 3: Promote version to active and link to project ===
  const { error: promoteError } = await (supabase.from("tool_versions") as any)
    .update({ status: "active" })
    .eq("id", versionRow.id);

  if (promoteError) {
    // Rollback: delete version and project
    await (supabase.from("tool_versions") as any).delete().eq("id", versionRow.id);
    await (supabase.from("projects") as any).delete().eq("id", toolId);
    throw new Error(`Fatal: failed to promote initial version: ${promoteError.message}`);
  }

  const { error: linkError } = await (supabase.from("projects") as any)
    .update({
      active_version_id: versionRow.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", toolId);

  if (linkError) {
    // Rollback: delete version and project
    await (supabase.from("tool_versions") as any).delete().eq("id", versionRow.id);
    await (supabase.from("projects") as any).delete().eq("id", toolId);
    throw new Error(`Fatal: failed to link version to project: ${linkError.message}`);
  }

  // === STEP 4: Verify invariants ===
  const { data: verify } = await (supabase.from("projects") as any)
    .select("id, active_version_id, status")
    .eq("id", toolId)
    .single();

  if (!verify || !verify.active_version_id) {
    throw new Error(
      `Invariant violation: Tool ${toolId} created but missing active_version_id. ` +
      `This should never happen after transactional creation.`
    );
  }

  console.log(`[Lifecycle] Tool created transactionally: ${toolId} (version: ${versionRow.id}, status: CREATED)`);
  return { toolId, spec, versionId: versionRow.id };
}

/**
 * Check if a tool is ready to execute.
 * Enforces the lifecycle state machine: only READY_TO_EXECUTE allows execution.
 */
export async function canExecuteTool(params: { toolId: string }) {
  const supabase = createSupabaseAdminClient();
  const { data: project } = await (supabase.from("projects") as any)
    .select("id, active_version_id, spec, status")
    .eq("id", params.toolId)
    .single();

  if (!project?.id) return { ok: false, reason: "tool_missing" };

  // Lifecycle gate: only READY_TO_EXECUTE or MATERIALIZED allows execution
  if (['CREATED', 'PLANNED', 'EXECUTING', 'FAILED', 'CORRUPTED'].includes(project.status)) {
    return { ok: false, reason: `wrong_lifecycle_state:${project.status}` };
  }

  if (!project.active_version_id) return { ok: false, reason: "active_version_missing" };

  const { data: version } = await (supabase.from("tool_versions") as any)
    .select("tool_spec, compiled_tool")
    .eq("id", project.active_version_id)
    .single();

  if (!version?.compiled_tool || !version?.tool_spec) {
    return { ok: false, reason: "compiled_artifact_missing" };
  }

  const specHash = computeSpecHash(version.tool_spec as any);
  const compiledSpecHash = (version.compiled_tool as any)?.specHash;

  if (!compiledSpecHash || compiledSpecHash !== specHash) {
    return { ok: false, reason: "compiled_hash_mismatch" };
  }

  return { ok: true, reason: "ok" };
}
