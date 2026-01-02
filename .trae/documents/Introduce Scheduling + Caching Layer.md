# Introduce Scheduling + Caching Layer (Phase 6)

I will implement a robust scheduling and caching system to make Assemblr execution time-aware, performant, and cost-efficient.

## Implementation Steps

### 1. Define Execution Policy & Result Model
**File:** `supabase/migrations/20251230190000_metric_executions.sql`
- Update `metrics` table:
  - Add `execution_policy` jsonb (mode, schedule, ttl, staleness).
- Create `metric_executions` table:
  - `id` (uuid)
  - `metric_id` (fk)
  - `status` (pending, running, completed, failed)
  - `started_at`, `completed_at`
  - `result` (jsonb)
  - `error` (text)
  - `triggered_by` (system, user)

### 2. Implement Execution Store
**File:** `lib/execution/store.ts`
- `getLatestExecution(metricId)`: Fetch most recent completed result.
- `createExecution(metricId)`: Log new run (status: pending).
- `completeExecution(id, result)`: Update status to completed.
- `failExecution(id, error)`: Update status to failed.

### 3. Implement Execution Orchestrator (Scheduler)
**File:** `lib/execution/scheduler.ts`
- **Function:** `scheduleMetricExecution(metricId)`
  - Checks if run is needed based on policy & last run.
  - If needed, triggers `runMetric`.
- **Function:** `runMetric(metricId)`
  - Wraps the existing execution logic.
  - Handles state updates (Pending -> Running -> Completed).
  - Enforces concurrency locks (don't run if already running).

### 4. Update Engine to Use Cache
**File:** `lib/execution/engine.ts`
- Modify `executeDashboard`:
  - For each metric view:
    1. Check `getLatestExecution`.
    2. If fresh (within TTL) -> Return cached result immediately.
    3. If stale but within `max_staleness` -> Return cache + trigger background refresh.
    4. If expired or missing -> Trigger blocking refresh (or return error/loading state depending on policy).

### 5. Update Chat to Respect Freshness
**File:** `lib/ai/tool-chat.ts`
- When generating spec, prefer existing metrics.
- Chat response should indicate "Data from [Time]" if cached.

### 6. Background Worker (Simulation)
**File:** `app/api/scheduler/run/route.ts`
- Create a cron-triggerable endpoint (e.g., for Vercel Cron or manual ping).
- Iterates over all `scheduled` metrics and calls `scheduleMetricExecution`.

## Verification Plan
1.  **Cache Hit:** Run dashboard -> Wait -> Run again. Second run should be instant and return same execution ID.
2.  **Staleness:** Manually expire a result (DB update). Run dashboard. Should see "stale" flag or trigger new run.
3.  **Scheduling:** Trigger scheduler endpoint. Verify "scheduled" metrics run without UI interaction.
4.  **Error Handling:** Force an integration error. Verify execution is logged as "failed" and previous cache (if any) is preserved or error shown.
