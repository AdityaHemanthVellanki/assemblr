import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ToolSpec } from "@/lib/spec/toolSpec";

export type ExecutionTrace = {
  id: string;
  orgId: string;
  traceType: "metric" | "alert" | "workflow";
  source: string;
  triggerRef?: string;
  inputs: any;
  outputs: any;
  dependencies: string[];
  status: "pending" | "running" | "completed" | "failed";
  error?: string;
  startedAt: string;
  completedAt?: string;
  metadata: any;
};

export async function createTrace(input: Omit<ExecutionTrace, "id" | "status" | "startedAt" | "completedAt">): Promise<ExecutionTrace> {
  const supabase = await createSupabaseServerClient();
  
  // @ts-ignore
  const { data, error } = await (supabase.from("execution_traces") as any)
    .insert({
      org_id: input.orgId,
      trace_type: input.traceType,
      source: input.source,
      trigger_ref: input.triggerRef,
      inputs: input.inputs,
      outputs: input.outputs,
      dependencies: input.dependencies,
      metadata: input.metadata,
      status: "pending",
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create trace: ${error.message}`);
  return mapRowToTrace(data);
}

export async function updateTrace(id: string, updates: Partial<ExecutionTrace>) {
  const supabase = await createSupabaseServerClient();
  
  const payload: any = {};
  if (updates.status) payload.status = updates.status;
  if (updates.outputs) payload.outputs = updates.outputs;
  if (updates.error) payload.error = updates.error;
  if (updates.status === "completed" || updates.status === "failed") {
    payload.completed_at = new Date().toISOString();
  }

  // @ts-ignore
  await (supabase.from("execution_traces") as any).update(payload).eq("id", id);
}

export async function getTrace(id: string): Promise<ExecutionTrace | null> {
  const supabase = await createSupabaseServerClient();
  
  // @ts-ignore
  const { data, error } = await (supabase.from("execution_traces") as any)
    .select()
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return mapRowToTrace(data);
}

function mapRowToTrace(row: any): ExecutionTrace {
  return {
    id: row.id,
    orgId: row.org_id,
    traceType: row.trace_type,
    source: row.source,
    triggerRef: row.trigger_ref,
    inputs: row.inputs,
    outputs: row.outputs,
    dependencies: row.dependencies,
    status: row.status,
    error: row.error,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    metadata: row.metadata,
  };
}

export type DraftRuntimeStatus = {
  planner_success: boolean;
  ui_generated: boolean;
  ui_rendered: boolean;
  version_persisted: boolean;
};

export type DraftRuntime = {
  traceId: string;
  toolId: string;
  spec: ToolSpec;
  status: DraftRuntimeStatus;
};

const DRAFT_RUNTIME_STORE = new Map<string, DraftRuntime>();

export function saveDraftRuntime(traceId: string, runtime: DraftRuntime) {
  DRAFT_RUNTIME_STORE.set(traceId, runtime);
}

export function getDraftRuntime(traceId: string): DraftRuntime | undefined {
  return DRAFT_RUNTIME_STORE.get(traceId);
}
