# Introduce Workflow Automation Engine (Phase 8)

I will implement a safe, event-driven Workflow Engine that triggers actions based on alerts or schedules.

## Implementation Steps

### 1. Define Workflow Model & Migration
**File:** `supabase/migrations/20251230210000_create_workflows.sql`
- Create `workflows` table:
  - `id`, `org_id`, `name`, `enabled`
  - `trigger_config` jsonb (type: alert | schedule, ref_id)
  - `actions` jsonb[] (type: slack | email | github, config)
- Create `workflow_runs` table:
  - Log execution history (status, logs, trigger_event).

### 2. Implement Workflow Store
**File:** `lib/workflows/store.ts`
- `createWorkflow(def)`
- `getWorkflowsForTrigger(type, refId)`
- `logWorkflowRun(run)`

### 3. Implement Workflow Engine
**File:** `lib/workflows/engine.ts`
- **Function:** `runWorkflow(workflowId, context)`
  - Sequential execution of actions.
  - Context contains trigger data (e.g. alert value, timestamp).
  - Error handling per action.
- **Function:** `executeAction(action, context)`
  - Dispatches to integration executors (reusing `lib/integrations/executors/*` logic or creating new Action Executors).

### 4. Hook into Triggers
**File:** `lib/alerts/actions.ts`
- Update `triggerAction` (from Phase 7) to check for Workflows triggered by this Alert.
- If found, queue/run the workflow.

**File:** `lib/execution/scheduler.ts`
- Add support for scheduled workflows (checking `trigger_config.type === 'schedule'`).

### 5. Update Chat Planner
**File:** `lib/ai/planner.ts`
- Add `create_workflow` intent.
- Support "If alert X triggers, do Y" logic.

## Verification Plan
1.  **Define Workflow:** Create workflow "If Alert X fires -> Log to Console".
2.  **Trigger:** Manually trigger the alert via `evaluateAlerts`.
3.  **Check:** Verify `workflow_runs` has a success record.
4.  **Action:** Create workflow "If Alert X fires -> Send Slack".
5.  **Mock:** Trigger and verify the "Slack" action stub is called with context data.
