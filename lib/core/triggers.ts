export type TriggerType = "cron" | "webhook" | "integration_event" | "state_condition";

export type TriggerCondition = {
  cron_expression?: string; // For Cron
  event_filter?: Record<string, any>; // For Events
  state_query?: string; // For State
};

export type Trigger = {
  id: string;
  tool_id: string;
  type: TriggerType;
  name: string;
  source: string; // IntegrationId or "internal"
  condition: TriggerCondition;
  bound_version_id: string;
  enabled: boolean;
  last_run_at?: string;
  next_run_at?: string;
  created_at: string;
  created_by: string;
};

export type ExecutionBudget = {
  max_runs_per_day: number;
  max_tokens: number;
  max_side_effects: number;
};
