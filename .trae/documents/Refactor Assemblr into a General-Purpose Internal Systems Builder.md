# Architecture Plan: General-Purpose Internal Systems Builder

This plan transforms Assemblr from a dashboard generator into a deterministic compiler and runtime for internal tools, adhering to the strict "Agent-Oriented" and "Compiled Intent" models.

## 1. Core Abstractions (`lib/core/`)
We will establish the non-negotiable primitives defined in the prompt.
- **`lib/core/intent.ts`**: Define `CompiledIntent` schema.
- **`lib/core/agent.ts`**: Define `Agent`, `TaskGraph`, `TaskNode` structures.
- **`lib/core/runtime.ts`**: Define `IntegrationRuntime` and `Capability` contracts.
- **`lib/core/miniapp.ts`**: Define strict `MiniApp`, `Page`, `Action` (with steps), and `Component` schemas.

## 2. Integration Runtime Refactor (`lib/integrations/`)
We will upgrade integrations from simple "Executors" to full "Runtimes".
- **Refactor `GitHubExecutor` -> `GitHubRuntime`**:
  - Implement `context_resolver()` to auto-resolve owner/repo from tokens (moving logic out of `tool-chat.ts`).
  - Implement `capabilities` registry explicitly.
- **Standardize `IntegrationRuntime`**: Ensure all integrations (Linear, Slack, etc.) implement the same interface for auth management and context resolution.

## 3. Planner & Orchestrator Pipeline (`lib/ai/`)
We will rewrite the execution pipeline to follow the "Compile -> Orchestrate -> Execute" model.
- **Update `planner.ts`**:
  - Change output from `ExecutionPlan[]` to `CompiledIntent`.
  - Enforce "no resource guessing" at the prompt level.
- **Rewrite `processToolChat` (The Orchestrator)**:
  1.  **Compile**: Call planner to get `CompiledIntent`.
  2.  **Decompose**: Convert intent into a `TaskGraph` (e.g., "Fetch Data" -> "Process" -> "Render").
  3.  **Dispatch**: Assign tasks to specific `Agent` instances (e.g., `GitHubAgent`).
  4.  **Execute**: Run the graph.
  5.  **Materialize**: If `Create Mode`, generate the `MiniApp` spec.
  6.  **Verify**: Run `HealthCheck` (rendered > 0, interactive > 0).

## 4. Mini App Runtime (`components/dashboard/`)
We will harden the runtime to support the new "Internal Tool" definition.
- **Update `tool-renderer.tsx`**:
  - Support `Action` with `steps[]` (e.g., `integration_call` -> `state_mutation`).
  - Enforce strict component whitelist (Container, Text, Input, Select, Button, Table, etc.).
  - Remove all legacy "dashboard/view" rendering logic from the `mini_app` path.

## 5. Strict Mode Enforcement
- **Create Mode**: Enforce "Success OR Failure" contract. If the app doesn't render or actions aren't bound, throw a hard error.
- **Chat Mode**: Ensure it only returns text/analysis and never mutates state.

## Execution Order
1.  **Define Types**: Create `lib/core/*.ts` to lock in the schemas.
2.  **Refactor Integrations**: Upgrade `GitHub` to the new Runtime contract.
3.  **Update Planner**: Switch to `CompiledIntent`.
4.  **Rewrite Pipeline**: Implement the Orchestrator in `tool-chat.ts`.
5.  **Update UI**: Enhance `MiniAppRuntime` for multi-step actions.
