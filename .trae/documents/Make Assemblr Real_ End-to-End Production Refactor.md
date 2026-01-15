# Architecture Plan: Operational Guarantees & Observability

This plan introduces strict observability, deterministic execution, and permission boundaries to Assemblr, transforming it from an opaque builder to a transparent platform.

## 1. Core Definitions (`lib/core/`)

We will define the immutable structures for tracing, errors, and permissions.

* **`lib/core/trace.ts`**: Define `ExecutionTrace`, `AgentExecution`, `IntegrationAccess`, `ActionExecution`.

* **`lib/core/errors.ts`**: Define the strict error taxonomy (`IntegrationAuthError`, `PermissionDeniedError`, etc.).

* **`lib/core/permissions.ts`**: Define `Permission` and `PermissionScope` types.

## 2. Observability Engine (`lib/observability/`)

We will implement the system that captures and persists execution data.

* **`lib/observability/tracer.ts`**: Implement `ExecutionTracer` class.

  * Methods: `startSpan`, `logIntegrationAccess`, `logStateMutation`, `finish`.

  * Persistence: For now, logs strict JSON to stdout (which can be piped to a collector) and returns the trace object to the client for Dev Mode visibility.

## 3. Runtime Contract Update (`lib/core/runtime.ts`)

We will enforce tracing and permissions at the runtime level.

* Update `Capability.execute` signature to accept `trace: ExecutionTracer`.

* Add `checkPermissions(permission: Permission)` method to `IntegrationRuntime`.

## 4. Integration Runtime Refactor (`lib/integrations/runtimes/`)

We will update existing runtimes to respect the new contract.

* **`GitHubRuntime`**:

  * Update `execute` to log exact API endpoints called, latency, and status to the trace.

  * Implement permission checks (e.g., ensure `github_commits_list` is allowed).

## 5. Orchestrator & Execution Refactor

We will wrap all execution paths in the new observability layer.

* **`lib/ai/tool-chat.ts`** **(The Orchestrator)**:

  * Initialize `ExecutionTrace` at start.

  * Log `CompiledIntent` and `TaskGraph`.

  * Pass tracer to agents/runtimes.

  * Catch ALL errors and map them to `ExecutionError` types with context.

  * Return trace in response metadata.

* **`app/actions/execute-action.ts`** **(The Action Runner)**:

  * Initialize `ExecutionTrace` for server-side actions.

  * Enforce permissions before executing the capability.

  * Log the result and persist the trace.

## 6. Deterministic Mode Enforcement

* **`lib/ai/planner.ts`**:

  * If `execution_policy.deterministic` is true, enforce seed/temperature=0 for AI calls.

  * Disable any "auto-retry" logic that isn't explicitly defined in the policy.

## Execution Order

1. **Define Core Types**: `trace.ts`, `errors.ts`, `permissions.ts`.
2. **Implement Tracer**: `tracer.ts`.
3. **Update Contracts**: `runtime.ts`.
4. **Refactor GitHub Runtime**: `github.ts`.
5. **Refactor Orchestrator**: `tool-chat.ts` (Major change).
6. **Refactor Action Executor**: `execute-action.ts`.

