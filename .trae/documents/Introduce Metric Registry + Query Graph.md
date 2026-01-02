# Introduce Metric Registry + Query Graph (Phase 5)

I will implement a persistent Metric Registry and Query Graph to make Assemblr a "tool-first" system with reusable, auditable metrics.

## Implementation Steps

### 1. Define Metric Model & Migration
**File:** `supabase/migrations/20251230180000_create_metrics.sql`
- Create `metrics` table:
  - `id` (uuid, pk)
  - `org_id` (fk)
  - `name` (text, unique per org)
  - `description` (text)
  - `integration_id` (text)
  - `capability_id` (text)
  - `resource` (text)
  - `definition` (jsonb) - stores fields, filters, aggregation
  - `version` (int)
  - `created_by` (fk)
  - `created_at` (timestamp)

### 2. Implement Metric Registry Store
**File:** `lib/metrics/store.ts`
- `createMetric(orgId, definition)`: Creates a new metric version. Checks for name collisions.
- `getMetric(id)`: Retrieves specific metric.
- `findMetrics(orgId, search)`: Fuzzy search for metrics (for AI).
- `updateMetric(id, definition)`: Increments version, archives old one (if we support history, otherwise simple update for Phase 1).

### 3. Update Dashboard Spec to Reference Metrics
**File:** `lib/spec/dashboardSpec.ts`
- Update `metricSchema` to support `metricRef` instead of inline definitions.
- `metricRef`: `{ id: string, version?: number }`.
- **Backward Compat:** Keep inline definition support for now, but AI should prefer refs.

### 4. Implement Query Graph Resolver
**File:** `lib/execution/graph.ts`
- `resolveMetricDependency(metricId)`: Recursively fetches definition.
- `buildQueryGraph(spec)`: specific -> dependencies.
- **Note:** For Phase 1, dependencies are flat (Dashboard -> Metric -> Query). We won't implement deep "Metric -> Metric" nesting yet unless requested, to keep it simple. The prompt asks for "Metric -> Base Query", which fits this model.

### 5. Update Execution Engine
**File:** `lib/execution/engine.ts`
- `executeDashboard`:
  - 1. Scan for `metricRef`.
  - 2. Load metric definitions from Registry.
  - 3. Hydrate into full `ExecutionPlan`.
  - 4. Execute.

### 6. Update AI Planner
**File:** `lib/ai/planner.ts`
- Inject **Available Metrics** into System Prompt.
- Instruct AI: "Check if a metric exists for this intent. If yes, use it. If no, create a new one."
- **New Tool/Action:** `create_metric` intent for the planner.

## Verification Plan
1.  **Registry:** Create a metric "Active Issues" via code. Verify in DB.
2.  **AI:** Chat "Show active issues". AI should find the existing metric and reference it in the spec.
3.  **Execution:** Verify dashboard loads by resolving the metric ID to the actual GitHub query.
4.  **Audit:** Verify no duplicate "Active Issues" metrics are created if one exists.
