# Introduce Explainability & Lineage System (Phase 10)

I will implement a unified Execution Trace system to track lineage and provide explanations.

## Implementation Steps

### 1. Database Schema Update
**File:** `supabase/migrations/20251230230000_observability.sql`
- Create `execution_traces` table:
  - `id`, `org_id`, `trace_type` (metric, alert, workflow), `source` (schedule, chat, dependency).
  - `inputs` (jsonb), `outputs` (jsonb).
  - `dependencies` (uuid[] - references parent trace ids).
  - `status`, `error`, `started_at`, `completed_at`.

### 2. Implement Observability Store
**File:** `lib/observability/store.ts`
- `createTrace(input)`
- `updateTrace(id, updates)`
- `getTraceLineage(id)`: Recursive fetch (or simple parent lookup).

### 3. Implement Tracer Helper
**File:** `lib/observability/tracer.ts`
- `withTrace(ctx, type, inputs, fn)`: Wrapper function to handle trace lifecycle automatically.

### 4. Instrument Engines
**File:** `lib/execution/scheduler.ts`
- Wrap `runMetricExecution` with `withTrace`.
- Pass `traceId` down to alert evaluator.

**File:** `lib/alerts/evaluator.ts`
- Accept `parentTraceId`.
- Wrap `evaluateAlerts` with `withTrace`.
- Pass `traceId` down to actions/workflows.

**File:** `lib/workflows/engine.ts`
- Accept `parentTraceId` (via context).
- Wrap `runWorkflow` with `withTrace`.

### 5. Implement Explainer Service
**File:** `lib/observability/explain.ts`
- `generateExplanation(traceId)`:
  - Fetches trace and parents.
  - Constructs natural language summary: "Workflow W ran because Alert A fired (Value 10 > 5). Alert A fired because Metric M executed."

### 6. Chat Integration
**File:** `lib/ai/planner.ts`
- Add `explain_trace` intent/tool support.
- Allow users to ask "Why did this run?".

## Verification Plan
1.  **Trace Generation:** Run a full flow (Metric -> Alert -> Workflow).
2.  **Database Check:** Verify 3 traces exist in `execution_traces`, linked via `dependencies`.
3.  **Explanation:** Call `generateExplanation` on the workflow trace. Verify output describes the chain.
4.  **Failure Trace:** Force an error in workflow. Verify trace captures error and explanation identifies the failure step.
