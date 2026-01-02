import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type Alert = {
  id: string;
  orgId: string;
  metricId: string;
  conditionType: "threshold" | "change";
  comparisonOp: "gt" | "lt" | "eq" | "gte" | "lte";
  thresholdValue: number;
  actionConfig: { type: "email" | "slack"; target: string };
  enabled: boolean;
  lastTriggeredAt?: string;
};

export async function createAlert(input: Omit<Alert, "id" | "lastTriggeredAt">): Promise<Alert> {
  const supabase = await createSupabaseServerClient();
  
  // @ts-ignore
  const { data, error } = await (supabase.from("alerts") as any)
    .insert({
      org_id: input.orgId,
      metric_id: input.metricId,
      condition_type: input.conditionType,
      comparison_op: input.comparisonOp,
      threshold_value: input.thresholdValue,
      action_config: input.actionConfig,
      enabled: input.enabled,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create alert: ${error.message}`);
  return mapRowToAlert(data);
}

export async function getAlertsForMetric(metricId: string): Promise<Alert[]> {
  const supabase = await createSupabaseServerClient();
  
  // @ts-ignore
  const { data, error } = await (supabase.from("alerts") as any)
    .select()
    .eq("metric_id", metricId)
    .eq("enabled", true);

  if (error || !data) return [];
  return data.map(mapRowToAlert);
}

export async function logAlertHistory(alertId: string, executionId: string, triggered: boolean, measuredValue: number) {
  const supabase = await createSupabaseServerClient();
  
  // @ts-ignore
  await (supabase.from("alert_history") as any).insert({
    alert_id: alertId,
    execution_id: executionId,
    triggered,
    measured_value: measuredValue,
  });

  if (triggered) {
    // @ts-ignore
    await (supabase.from("alerts") as any)
      .update({ last_triggered_at: new Date().toISOString() })
      .eq("id", alertId);
  }
}

function mapRowToAlert(row: any): Alert {
  return {
    id: row.id,
    orgId: row.org_id,
    metricId: row.metric_id,
    conditionType: row.condition_type,
    comparisonOp: row.comparison_op,
    thresholdValue: row.threshold_value,
    actionConfig: row.action_config,
    enabled: row.enabled,
    lastTriggeredAt: row.last_triggered_at,
  };
}
