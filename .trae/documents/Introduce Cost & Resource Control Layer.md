# Introduce Cost & Resource Control Layer (Phase 11)

I will implement a robust Resource Control Layer to enforce budgets, rate limits, and cost estimates.

## Implementation Steps

### 1. Database Schema Update
**File:** `supabase/migrations/20251230240000_resource_control.sql`
- Create `org_budgets` table:
  - `org_id`, `daily_limit` (credits), `monthly_limit` (credits).
  - `used_today` (credits), `used_this_month` (credits).
  - `last_reset_at` (timestamptz).
- Create `integration_limits` table:
  - `integration_id` (github, slack, etc.), `requests_per_minute`, `concurrency_limit`.

### 2. Implement Cost Store & Logic
**File:** `lib/security/cost-store.ts`
- `getBudget(orgId)`: Fetch or create default budget.
- `checkAndConsumeBudget(orgId, cost)`: Atomic check-and-update.
- `resetBudgetIfNeeded(budget)`: Logic to reset daily/monthly counters.

**File:** `lib/security/cost-model.ts`
- `estimateCost(capabilityId, params)`: Returns estimated credits.
  - e.g., "list_issues" = 1 credit.
  - "heavy_query" = 5 credits.
  - "workflow_action" = 10 credits.

### 3. Implement Rate Limiter (Enhanced)
**File:** `lib/security/rate-limit.ts`
- Extend existing in-memory limiter to support distributed/DB-backed limiting (or stick to robust in-memory for single-instance Phase 11).
- Add `checkIntegrationLimit(integrationType)`.

### 4. Instrument Execution Engines
**File:** `lib/execution/scheduler.ts`
- Before `runMetricExecution`:
  - Estimate cost (e.g., 1 credit per metric run).
  - Call `checkAndConsumeBudget`.
  - Call `checkIntegrationLimit`.

**File:** `lib/workflows/engine.ts`
- Before `runWorkflow`:
  - Estimate cost (e.g., sum of action costs).
  - Check budgets.
  - Enforce "Max Depth" / "Loop Detection" (using trace history).

### 5. Chat Integration
**File:** `lib/ai/planner.ts`
- Update planner to catch "Quota Exceeded" errors and explain them nicely.

## Verification Plan
1.  **Define Budget:** Set org budget to 5 credits.
2.  **Run Metric:** Cost 1 credit. Verify usage = 1.
3.  **Run Workflow:** Cost 10 credits. Verify BLOCK with "Budget Exceeded" error.
4.  **Reset:** Manually reset budget. Verify execution succeeds.
5.  **Rate Limit:** Rapidly trigger 10 runs. Verify Rate Limit error kicks in.
