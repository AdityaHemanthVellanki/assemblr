# Introduce Multi-Integration Join Engine (Phase 12)

I will implement a Join Engine to safely join data across integrations.

## Implementation Steps

### 1. Database Schema Update
**File:** `supabase/migrations/20251230250000_joins.sql`
- Create `join_definitions` table:
  - `id`, `org_id`, `name`.
  - `left_integration_id`, `left_resource`, `left_field`.
  - `right_integration_id`, `right_resource`, `right_field`.
  - `join_type` (inner | left | right).
  - `confidence` (explicit | inferred).

### 2. Implement Join Store
**File:** `lib/joins/store.ts`
- `createJoinDefinition(input)`
- `getJoinDefinitions(orgId)`
- `getJoinsForResources(leftResource, rightResource)`

### 3. Implement Join Executor
**File:** `lib/joins/executor.ts`
- `executeJoin(joinDef, leftData, rightData)`:
  - Performs in-memory join.
  - Normalizes data.
  - Returns `joinedResults` and `stats` (matched, dropped).
- **Safety:** Enforce memory limits (e.g. max 10k rows per side for Phase 1).

### 4. Integrate with Execution Engine
**File:** `lib/execution/engine.ts`
- Update `executeDashboard` (or create `executeJoinedMetric`) to support join execution.
- If a metric definition references a `joinId`, fetch data from both sources and pass to `executeJoin`.

### 5. Update AI Planner
**File:** `lib/ai/planner.ts`
- Add `newJoin` output to `ExecutionPlan`.
- Update prompt to:
  - Detect when user asks for data from multiple sources.
  - Check if a join exists.
  - If not, suggest creating a `newJoin` (explicit confirmation).

## Verification Plan
1.  **Define Join:** Create a manual join definition (e.g., Mock GitHub Issues `title` = Mock Linear Issues `title`).
2.  **Mock Data:** Create simple mock data arrays.
3.  **Execute:** Run `executeJoin` and verify output rows match the condition.
4.  **Planner:** Ask "Join GitHub and Linear issues on title". Verify planner suggests `newJoin`.
5.  **Safety:** Try joining large arrays (mock). Verify it works or fails gracefully if limit exceeded.
