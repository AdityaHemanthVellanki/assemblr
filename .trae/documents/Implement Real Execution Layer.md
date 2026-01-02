# Implement Real Execution Layer (Phase 2)

I will transform Assemblr into a strict "Spec → Execution → Real Data" engine.

## Implementation Steps

### 1. Define Execution Primitives
**File:** `lib/execution/types.ts`
- Create `ExecutionPlan`: derived from spec, specific to an integration (e.g., `github.issues.list`).
- Create `ExecutionResult`: strict type for rows, error, timestamp, source.
- Ensure strict separation: `Spec` (intent) -> `Plan` (compiled intent) -> `Result` (outcome).

### 2. Update Dashboard Spec to Support Integration Queries
**File:** `lib/spec/dashboardSpec.ts`
- Currently, the spec assumes "tables" (`table: "users"`).
- **Refactor:** Add `integrationId` and `queryType` to `metricSchema` and `viewSchema`.
- **New Logic:** A metric must know *which* integration to query.
  - e.g., `table: "issues"` -> `integration: "linear"`, `resource: "issues"`.

### 3. Implement Execution Logic (The "Engine")
**File:** `lib/execution/engine.ts`
- **Function:** `executeDashboard(orgId, spec)`
- **Logic:**
  1.  Parse spec to identify required data sources.
  2.  Check for connected integrations (`integration_connections`).
  3.  **Fail Fast:** If integration missing, return explicit error result.
  4.  Route to specific integration executor (e.g., `GitHubExecutor`).
  5.  Execute real API call (no database mocks).
  6.  Return `ExecutionResult` map keyed by metric/view ID.

### 4. Create Integration Executors
**Files:** `lib/integrations/executors/*`
- Implement `execute(plan, credentials)` for:
  - `GitHubExecutor`: Map `table: "issues"` -> `GET /repos/.../issues` or GraphQL.
  - `LinearExecutor`: Map `table: "issues"` -> GraphQL query.
  - `GoogleExecutor`: Map `table: "emails"` -> Gmail API.
  - `SlackExecutor`: Map `table: "messages"` -> `conversations.history`.
  - `NotionExecutor`: Map `table: "pages"` -> `search` or `database.query`.
- **Strict Rule:** Return real data or error. No "success with empty array" unless truly empty.

### 5. Update Tool Renderer to Consume Execution Results
**File:** `components/dashboard/tool-renderer.tsx`
- **Props:** Add `executionResults` prop.
- **Logic:**
  - If `executionResults[view.id]` is missing/pending -> Show "Loading...".
  - If error -> Show "Execution Failed: [Reason]".
  - If success -> Render chart/table with *real rows*.
- **Constraint:** The chart component must read strictly from `result.data`.

### 6. Wire Up Server Action for Execution
**File:** `app/actions/execute-tool.ts` (New)
- Create a server action `runToolExecution(toolId)` that calls the Engine.
- Call this action on mount in `ProjectWorkspace`.

## Verification Plan
1.  **Unit Test:** Create `test/execution/engine.test.ts` to verify flow (Spec -> Plan -> Result).
2.  **Integration Test:** Verify `GitHubExecutor` fails without token, succeeds with real token (using existing smoke test infrastructure).
3.  **Manual Check:** Connect GitHub, create "Show Issues" tool, verify real issues appear in table.
