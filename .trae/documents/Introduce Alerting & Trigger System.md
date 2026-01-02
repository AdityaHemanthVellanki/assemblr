# Introduce Alerting & Trigger System (Phase 7)

I will implement an event-driven Alerting System that monitors metrics and triggers actions.

## Implementation Steps

### 1. Define Alert Model & Migration
**File:** `supabase/migrations/20251230200000_create_alerts.sql`
- Create `alerts` table:
  - `id`, `org_id`, `metric_id`
  - `condition_type` (threshold, relative_change)
  - `threshold_value` (numeric)
  - `comparison_op` (gt, lt, eq, gte, lte)
  - `action_config` (jsonb: { type: 'slack', channelId: '...' })
  - `enabled` (boolean)
  - `last_triggered_at` (timestamptz)
- Create `alert_history` table:
  - Log trigger events (timestamp, value, triggered).

### 2. Implement Alert Store
**File:** `lib/alerts/store.ts`
- `createAlert(def)`
- `getAlertsForMetric(metricId)`
- `logAlertHistory(alertId, executionId, triggered)`

### 3. Implement Alert Evaluator
**File:** `lib/alerts/evaluator.ts`
- **Function:** `evaluateAlerts(metricId, executionResult)`
  - Called by the Scheduler after a metric completes.
  - Iterates all enabled alerts for that metric.
  - **Logic:**
    - Parse metric result (extract value).
    - Compare against threshold.
    - Check cooldown (don't spam).
    - If triggered -> `triggerAction`.

### 4. Implement Action Dispatcher (Phase 1: Mock/Log)
**File:** `lib/alerts/actions.ts`
- **Function:** `triggerAction(alert, value)`
  - Switch on action type.
  - For Phase 1, we will implement a "System Log" action and a "Slack Webhook" stub (if integration available).
  - **Note:** Real Slack sending requires the Slack App implementation, which we will stub for now or use the generic API if token exists.

### 5. Hook into Scheduler
**File:** `lib/execution/scheduler.ts`
- Update `runMetricExecution`:
  - AFTER `updateExecutionStatus("completed")`
  - CALL `evaluateAlerts(metricId, result)`.
  - Ensure this doesn't block the scheduler (fire and forget or safe await).

### 6. Update Chat Planner
**File:** `lib/ai/planner.ts`
- Add `create_alert` intent support (or instructions to use `createAlert` tool).
- **New Tool/Action:** `create_alert` capability for the AI.

## Verification Plan
1.  **Define Alert:** Create alert "Notify if Issues > 5" on "Open Issues" metric.
2.  **Trigger:** Run metric execution. Mock result to 6.
3.  **Check:** Verify `alert_history` has a record. Verify `last_triggered_at` updated.
4.  **Negative Test:** Run metric with result 4. Verify no trigger.
5.  **Scheduler Integration:** Trigger scheduler run. Verify alerts are evaluated automatically.
