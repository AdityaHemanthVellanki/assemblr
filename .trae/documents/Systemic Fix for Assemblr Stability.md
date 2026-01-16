# Systemic Fix for Assemblr Stability

I will implement a comprehensive architectural fix to prevent invalid intents, enforcing strict compiler contracts and robust runtime handling.

## 1. Runtime Hardening (`components/miniapp/`)

### **A. Loose Binding & Safety (`runtime.tsx`)**
-   **Warning, Not Crashing**: Update `dispatch` to log a warning (`console.warn`) and gracefully return if an action ID is missing, instead of throwing an error.
-   **Export Helpers**: Export `resolvePath` to be used by components for consistent data resolution.

### **B. Declarative Derived State (`components.tsx`)**
-   **New `resolveDataSource`**: Implement a universal data resolver that supports:
    -   `type: "state"` (Existing)
    -   `type: "derived"` (New): Supports on-the-fly filtering and sorting within the render cycle.
        -   Logic: Accepts `source` (state key) and `filters` (array of state keys).
        -   Behavior: Automatically applies filters (equality/inclusion) against item fields matching the filter key name (heuristic: `filters.status` -> field `status`).
-   **Component Updates**: Update `List`, `Table`, `Heatmap`, and `Dropdown` to use `resolveDataSource`.

## 2. Planner Logic & Validation (`lib/ai/planner-logic.ts`)

### **A. Auto-Wiring Repair (`repairCompiledIntent`)**
-   **Status Action Elimination**: Scan for and remove "status mirroring" actions (actions that only update `*Status`/`*Error` keys), relying on the runtime's built-in status management.
-   **Filter Action Transformation**: Detect "filter" actions (legacy `state_transform` or `internal` with filter semantics) and:
    1.  Identify the target state key (e.g., `filteredData`).
    2.  Find components binding to `filteredData`.
    3.  Rewrite component `dataSource` to `{ type: "derived", source: "rawData", filters: [...] }`.
    4.  Remove the obsolete filter action and the intermediate state key.
-   **Untriggered Action Repair**: Automatically bind untriggered actions to `onPageLoad` (hydration) or remove them if they are unreachable dead code.

### **B. Strict Validation (`validateCompiledIntent`)**
-   **Planner Invariant Check**:
    -   **Strict Action Types**: Throw `PlannerInvariantError` if any action type is not `integration_call`, `internal`, `navigation`, or `workflow`.
    -   **Banned Keys**: validation will reject `__derivation`, `__from`, etc.
-   **Trigger Enforcement**: Throw if any action (except `workflow` steps) has no `triggeredBy` and is not auto-repairable.
-   **Relaxed Effect Validation**: Update validation logic to skip "unused output" checks for actions marked `effectOnly: true`.

## 3. Verification (`scripts/`)

### **Contract Tests (`test-system-stability.ts`)**
-   Create a new test suite that asserts:
    1.  **Invalid Types**: `state_transform` actions are repaired or rejected.
    2.  **Untriggered**: Actions without triggers are fixed.
    3.  **Filter Logic**: Filter actions are converted to declarative `dataSource`.
    4.  **Effect-Only**: `effectOnly` actions pass validation.
    5.  **Status**: Explicit status actions are removed.

## Execution Steps
1.  **Refactor Runtime**: Update `runtime.tsx` (export helpers, loose binding) and `components.tsx` (derived state).
2.  **Update Planner**: Modify `planner-logic.ts` to implement the repair and strict validation logic.
3.  **Add Tests**: Create and run `scripts/test-system-stability.ts`.
4.  **Verify**: Ensure all regression tests pass.
