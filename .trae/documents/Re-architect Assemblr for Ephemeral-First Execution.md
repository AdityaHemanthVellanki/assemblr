I will re-architect Assemblr to enforce the **Execution-First / Ephemeral-First** paradigm.

### **Core Architecture Changes**

1.  **Introduce `ExecutionMode`**:
    *   I will add `execution_mode: "ephemeral" | "materialize" | "tool"` to the `ExecutionPlan` definition.
    *   **Default**: `ephemeral` (Chat -> Execute -> Answer).
    *   **Explicit**: `materialize` (Chat -> Execute -> **Schema** -> **Dashboard**).

2.  **Planner Logic Update (`lib/ai/planner.ts`)**:
    *   I will update the System Prompt to instruct the LLM to default to `ephemeral`.
    *   It will only choose `materialize` if the user explicitly asks to "save", "track", or "add to dashboard".
    *   I will explicitly allow `ad_hoc` capabilities in the prompt, removing the need for pre-registration for exploratory queries.

3.  **Orchestrator Logic Update (`lib/ai/tool-chat.ts`)**:
    *   I will refactor the pipeline to branch *after* execution:
        *   **Branch A (Ephemeral)**: If no plans require persistence, I will simply format the execution results into a text response and return. **No Schema Inference. No Spec Generation.**
        *   **Branch B (Materialize)**: If any plan requires persistence, I will proceed to infer schemas, persist them to `integration_schemas`, and then invoke the Spec Generator to update the dashboard.

4.  **Defensive Handling**:
    *   I will ensure that `ad_hoc` capabilities are passed through validation without error.
    *   I will verify that the dashboard renderer (which I previously updated) remains defensive against missing data.

### **Verification Plan**

I will verify the changes with the following scenarios:
1.  **Ephemeral Query**: "What's my GitHub username?" -> Verifies execution happens, data is returned, but dashboard spec remains unchanged.
2.  **Materialized Query**: "Add this to my dashboard" -> Verifies schema discovery runs and spec is updated.
3.  **Ad-Hoc Capability**: "Count commits in repo X" -> Verifies dynamic capability resolution works without registry errors.
