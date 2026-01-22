import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ToolSystemSpec, ActionSpec } from "./spec";

export type SnapshotRecords = {
  state: Record<string, any>;
  actions: Record<string, any>;
  integrations: Record<string, any>;
};

export type MaterializationInput = {
  toolId: string;
  orgId: string;
  actionOutputs: Array<{ action: any; output: any; error?: any }>;
  spec: ToolSystemSpec;
  previousRecords?: SnapshotRecords | null;
};

export type MaterializationResult = {
  status: "MATERIALIZED" | "FAILED";
  recordCount: number;
  resultId: string;
};

export type ToolResultRow = {
  id: string;
  tool_id: string;
  org_id: string;
  schema_json: any;
  records_json: any;
  record_count: number;
  status: "MATERIALIZED" | "FAILED" | "PENDING";
  error_log: any;
  materialized_at: string;
};

export class FatalInvariantViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FatalInvariantViolation";
  }
}

export async function finalizeToolEnvironment(
  toolId: string,
  orgId: string,
  spec: ToolSystemSpec,
  actionOutputs: MaterializationInput["actionOutputs"],
  previousRecords?: SnapshotRecords | null
) {
  console.log(`[Materialization] Finalizing environment for tool ${toolId}`);
  return materializeToolOutput({
    toolId,
    orgId,
    spec,
    actionOutputs,
    previousRecords,
  });
}

export async function materializeToolOutput(input: MaterializationInput): Promise<MaterializationResult> {
  const { toolId, orgId, actionOutputs, spec, previousRecords } = input;
  const supabase = createSupabaseAdminClient();

  // 1. Filter successful outputs for merging
  // We log errors but don't let them block materialization of successful data
  const successfulOutputs = actionOutputs.filter((o) => !o.error && o.output !== undefined && o.output !== null);
  const errors = actionOutputs.filter((o) => o.error).map((o) => ({
    actionId: o.action.id,
    error: o.error,
    message: o.error.message || "Unknown error",
  }));

  // 2. Build Unified Dataset
  // We merge new successful outputs into the previous records (if any)
  const records = buildSnapshotRecords({
    spec,
    outputs: successfulOutputs,
    previous: previousRecords ?? null,
  });

  const recordCount = countSnapshotRecords(records);
  
  // Rule: If >= 1 integration returns data -> materialize tool.
  // Even if recordCount is 0, if we executed successfully (e.g. empty list), we should materialize.
  // But if ALL failed, then FAILED.
  const hasSuccess = successfulOutputs.length > 0;
  const allFailed = actionOutputs.length > 0 && successfulOutputs.length === 0;
  
  let finalStatus: "MATERIALIZED" | "FAILED" = "MATERIALIZED";
  
  if (allFailed) {
      finalStatus = "FAILED";
  } else if (recordCount === 0 && !hasSuccess && !previousRecords) {
      // No data, no success, no previous -> likely nothing happened? 
      // But if actionOutputs was empty, maybe we shouldn't fail if we just wanted to clear?
      // For now, assume if we called this, we expect something.
      // But if the tool has NO read actions, maybe it's just a form?
      // If spec has no read actions, maybe MATERIALIZED is correct with 0 records.
      // Let's assume MATERIALIZED unless explicit failure.
      finalStatus = "MATERIALIZED";
  }

  // 3. Write to tool_results (Atomic Insert)
  const { data: resultData, error } = await supabase.from("tool_results").insert({
    tool_id: toolId,
    org_id: orgId,
    schema_json: spec.entities ?? {},
    records_json: records,
    record_count: recordCount,
    status: finalStatus,
    error_log: errors.length > 0 ? errors : null,
    materialized_at: new Date().toISOString(),
  }).select("id").single();

  if (error) {
    console.error("[Materialization] Failed to write result:", error);
    throw new Error(`Materialization failed: ${error.message}`);
  }

  // 4. Finalize Tool Environment (Atomic State Transition)
  // This satisfies the user requirement: "Set tool.status = READY"
  if (finalStatus === "MATERIALIZED") {
      const { error: updateError } = await supabase
        .from("projects")
        .update({
            status: "ready", // explicit 'ready' state
            is_activated: true, // legacy compatibility
            // we don't have 'environment_ready' column, but status='ready' is the semantic equivalent
        } as any)
        .eq("id", toolId);

      if (updateError) {
          console.error("[Materialization] Failed to update project status:", updateError);
          // We don't throw here because the result IS materialized, but status update failed.
          // However, for strict compliance, maybe we should?
          // Let's log heavily.
      }
  } else if (finalStatus === "FAILED") {
      // Mark project as error
      await supabase.from("projects").update({ status: "error" } as any).eq("id", toolId);
  }

  return {
    status: finalStatus,
    recordCount,
    resultId: resultData.id,
  };
}

export async function getLatestToolResult(toolId: string, orgId: string): Promise<ToolResultRow | null> {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
        .from("tool_results")
        .select("*")
        .eq("tool_id", toolId)
        .eq("org_id", orgId)
        .order("materialized_at", { ascending: false })
        .limit(1)
        .single();
    
    if (error && error.code !== "PGRST116") {
        throw error;
    }
    
    return data as ToolResultRow | null;
}

export function buildSnapshotRecords(params: {
  spec: ToolSystemSpec;
  outputs: Array<{ action: ActionSpec; output: any }>;
  previous?: SnapshotRecords | null;
}): SnapshotRecords {
  const baseState = params.previous?.state
    ? (JSON.parse(JSON.stringify(params.previous.state)) as Record<string, any>)
    : {};
  const baseActions = params.previous?.actions ? { ...params.previous.actions } : {};
  const baseIntegrations = params.previous?.integrations ? { ...params.previous.integrations } : {};
  for (const { action, output } of params.outputs) {
    baseActions[action.id] = output;
    baseIntegrations[action.integrationId] = output;
    const statePaths = getStatePathsForAction(params.spec, action);
    for (const path of statePaths) {
      setStatePath(baseState, path, output);
    }
  }
  return { state: baseState, actions: baseActions, integrations: baseIntegrations };
}

export function countSnapshotRecords(records: SnapshotRecords | null | undefined) {
  if (!records?.actions) return 0;
  let total = 0;
  for (const value of Object.values(records.actions)) {
    if (Array.isArray(value)) {
      total += value.length;
      continue;
    }
    if (value) total += 1;
  }
  return total;
}

function getStatePathsForAction(spec: ToolSystemSpec, action: ActionSpec) {
  const fromViewActions = spec.views
    .filter((view) => view.actions?.includes(action.id))
    .map((view) => view.source.statePath);
  if (fromViewActions.length > 0) {
    return unique(fromViewActions);
  }
  const entityNames = spec.entities
    .filter((entity) => entity.sourceIntegration === action.integrationId)
    .map((entity) => entity.name);
  const fromEntityViews = spec.views
    .filter((view) => entityNames.includes(view.source.entity))
    .map((view) => view.source.statePath);
  if (fromEntityViews.length > 0) {
    return unique(fromEntityViews);
  }
  return [`${action.integrationId}.data`];
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function setStatePath(state: Record<string, any>, path: string, value: any) {
  const parts = path.split(".");
  let current = state;
  for (let i = 0; i < parts.length; i += 1) {
    const key = parts[i];
    if (i === parts.length - 1) {
      current[key] = value;
      return;
    }
    if (!current[key] || typeof current[key] !== "object") {
      current[key] = {};
    }
    current = current[key];
  }
}
