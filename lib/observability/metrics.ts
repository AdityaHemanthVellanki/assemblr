import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WorkflowMetric {
  id: string;
  orgId: string;
  toolId: string;
  metricName: string;
  metricValue: number;
  dimensions: Record<string, any>;
  recordedAt: string;
}

export interface ToolHealth {
  toolId: string;
  totalRuns: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  avgDurationMs: number;
  lastRunAt: string | null;
  triggerInvocations: number;
  recentErrors: string[];
}

// ─── Record ─────────────────────────────────────────────────────────────────

/**
 * Fire-and-forget metric recording. Failures are logged but never thrown.
 */
export function recordMetric(params: {
  orgId: string;
  toolId: string;
  metricName: string;
  metricValue: number;
  dimensions?: Record<string, any>;
}) {
  const { orgId, toolId, metricName, metricValue, dimensions } = params;
  const supabase = createSupabaseAdminClient();

  void (supabase.from("workflow_metrics") as any)
    .insert({
      org_id: orgId,
      tool_id: toolId,
      metric_name: metricName,
      metric_value: metricValue,
      dimensions: dimensions ?? {},
    })
    .then(({ error }: any) => {
      if (error) {
        console.warn(`[Metrics] Failed to record ${metricName}:`, error.message);
      }
    });
}

// ─── Query ──────────────────────────────────────────────────────────────────

export async function getMetrics(params: {
  toolId: string;
  metricName?: string;
  since?: string;
  limit?: number;
}): Promise<WorkflowMetric[]> {
  const { toolId, metricName, since, limit = 100 } = params;
  const supabase = createSupabaseAdminClient();

  let query = (supabase.from("workflow_metrics") as any)
    .select("*")
    .eq("tool_id", toolId)
    .order("recorded_at", { ascending: false })
    .limit(limit);

  if (metricName) {
    query = query.eq("metric_name", metricName);
  }
  if (since) {
    query = query.gte("recorded_at", since);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  return (data as any[]).map(mapRowToMetric);
}

// ─── Tool Health ────────────────────────────────────────────────────────────

export async function getToolHealth(params: {
  toolId: string;
  orgId: string;
  windowHours?: number;
}): Promise<ToolHealth> {
  const { toolId, orgId, windowHours = 24 } = params;
  const since = new Date(Date.now() - windowHours * 3600_000).toISOString();

  const metrics = await getMetrics({ toolId, since, limit: 500 });

  let totalRuns = 0;
  let successCount = 0;
  let failureCount = 0;
  let totalDurationMs = 0;
  let durationCount = 0;
  let lastRunAt: string | null = null;
  let triggerInvocations = 0;
  const recentErrors: string[] = [];

  for (const m of metrics) {
    if (m.metricName === "workflow.completed" || m.metricName === "action.completed") {
      successCount++;
      totalRuns++;
      if (!lastRunAt || m.recordedAt > lastRunAt) lastRunAt = m.recordedAt;
    } else if (m.metricName === "workflow.failed" || m.metricName === "action.failed") {
      failureCount++;
      totalRuns++;
      if (!lastRunAt || m.recordedAt > lastRunAt) lastRunAt = m.recordedAt;
      if (m.dimensions?.error) {
        recentErrors.push(String(m.dimensions.error).slice(0, 200));
      }
    } else if (m.metricName === "workflow.duration_ms" || m.metricName === "action.duration_ms") {
      totalDurationMs += m.metricValue;
      durationCount++;
    } else if (m.metricName === "trigger.invoked") {
      triggerInvocations++;
    }
  }

  return {
    toolId,
    totalRuns,
    successCount,
    failureCount,
    successRate: totalRuns > 0 ? successCount / totalRuns : 0,
    avgDurationMs: durationCount > 0 ? Math.round(totalDurationMs / durationCount) : 0,
    lastRunAt,
    triggerInvocations,
    recentErrors: recentErrors.slice(0, 5),
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function mapRowToMetric(row: any): WorkflowMetric {
  return {
    id: row.id,
    orgId: row.org_id,
    toolId: row.tool_id,
    metricName: row.metric_name,
    metricValue: Number(row.metric_value),
    dimensions: row.dimensions ?? {},
    recordedAt: row.recorded_at,
  };
}
