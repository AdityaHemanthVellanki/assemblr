import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type MetricExecution = {
  id: string;
  metricId: string;
  status: "pending" | "running" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  result?: any;
  error?: string;
  triggeredBy: string;
};

export async function getLatestExecution(metricId: string): Promise<MetricExecution | null> {
  const supabase = await createSupabaseServerClient();

  // @ts-ignore
  const { data, error } = await (supabase.from("metric_executions") as any)
    .select()
    .eq("metric_id", metricId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return mapRowToExecution(data);
}

export async function createExecution(metricId: string, triggeredBy: string = "system"): Promise<MetricExecution> {
  const supabase = await createSupabaseServerClient();

  // @ts-ignore
  const { data, error } = await (supabase.from("metric_executions") as any)
    .insert({
      metric_id: metricId,
      status: "pending",
      triggered_by: triggeredBy,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create execution: ${error.message}`);
  return mapRowToExecution(data);
}

export async function updateExecutionStatus(
  id: string,
  status: "running" | "completed" | "failed",
  payload?: { result?: any; error?: string }
): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const updates: any = { status };
  if (status === "completed") {
    updates.completed_at = new Date().toISOString();
    updates.result = JSON.stringify(payload?.result);
  }
  if (status === "failed") {
    updates.completed_at = new Date().toISOString();
    updates.error = payload?.error;
  }

  // @ts-ignore
  const { error } = await (supabase.from("metric_executions") as any)
    .update(updates)
    .eq("id", id);

  if (error) throw new Error(`Failed to update execution: ${error.message}`);
}

function mapRowToExecution(row: any): MetricExecution {
  return {
    id: row.id,
    metricId: row.metric_id,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    result: row.result ? (typeof row.result === 'string' ? JSON.parse(row.result) : row.result) : undefined,
    error: row.error,
    triggeredBy: row.triggered_by,
  };
}
