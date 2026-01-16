I will implement the **Fault-Tolerant Action Graph Validator** and **Pre-Execution Dry Run** to ensure Assemblr never crashes on user prompts.

### 1. Implement DAG Action Graph Validator
In `lib/ai/planner-logic.ts`, I will add `validateActionGraph` which will:
- **Build the Graph**: Map all components, events, actions, and state dependencies into a Directed Acyclic Graph (DAG).
- **Enforce Invariants**:
    - **Reachability**: Ensure every action is triggered by a UI event, lifecycle event, or state change.
    - **Auto-Healing**: Automatically bind unreachable actions to `onPageLoad` (for hydration) or internal system triggers instead of throwing errors.
    - **State Integrity**: Verify that all `bindKey` references resolve to canonical state keys.
- **Integration Contracts**: Enforce `producesData` vs `producesSideEffects` rules (Part 5), ensuring effect-only actions don't trigger "unused data" errors.

### 2. Implement Pre-Execution Dry Run (Part 6)
In `lib/ai/planner-logic.ts`, I will add `simulateExecution` which will:
- **Simulate Triggers**: "Run" the action graph in memory to verify that triggers actually fire their target actions.
- **Detect Deadlocks/Loops**: Identify infinite loops (A triggers B triggers A) and break them.
- **Verify Data Flow**: Ensure integration outputs flow into UI components or derived state.

### 3. Refactor Validation Pipeline
I will update `validateCompiledIntent` to use these new systems:
- **Non-Fatal Validation**: Replace `throw new Error` with auto-correction logic (e.g., "Action X is invalid" -> "Convert X to internal").
- **Canonicalization**: Ensure all state keys are normalized (Part 2) before validation.

### 4. Regression Testing
I will run `scripts/regression-hardening.ts` to verify:
- No "Action not triggered" errors.
- No "Invalid action type" errors.
- Successful graph simulation.
