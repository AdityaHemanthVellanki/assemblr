# Introduce Capability Planner + Query Synthesizer (Phase 4)

I will implement a formal capability planning layer to deterministically convert user intent into validated queries.

## Implementation Steps

### 1. Define Capability Registry
**File:** `lib/capabilities/registry.ts`
- Create `Capability` interface: `id`, `resource`, `operations` (read, filter, etc), `supportedFields`.
- Define capabilities for each Phase 1 integration:
  - **GitHub:** `github_issues_list`, `github_repos_list`
  - **Linear:** `linear_issues_list`, `linear_teams_list`
  - **Slack:** `slack_channels_list`, `slack_messages_list`
  - **Notion:** `notion_pages_search`
  - **Google:** `google_drive_list`, `google_gmail_list`
- This replaces the implicit capabilities in `lib/integrations/capabilities.ts`.

### 2. Build Capability Planner
**File:** `lib/ai/planner.ts`
- **Function:** `planExecution(intent, schemas, capabilities)`
- **Logic:**
  1.  Match user intent (e.g., "show issues") to a registered capability (`github_issues_list`).
  2.  Validate against discovered schemas (does the user want "status"? does schema have "state"?).
  3.  Produce `ExecutionPlan` with strict fields: `integrationId`, `capabilityId`, `resource`, `params`.
  4.  **Error Handling:** Throw `AmbiguousIntentError` or `UnsupportedCapabilityError` if no match found.

### 3. Implement Query Synthesis
**File:** `lib/execution/synthesizer.ts`
- **Function:** `synthesizeQuery(plan)`
- **Logic:**
  - Map `ExecutionPlan` to the exact API parameters required by the `IntegrationExecutor`.
  - e.g., Plan: `{ filters: { state: "open" } }` -> GitHub API: `?state=open`.
  - **Strict Rule:** No guessing. If the plan asks for a filter not supported by the synthesis logic, fail.

### 4. Pre-Execution Validation
**File:** `lib/execution/validation.ts`
- Update `validateSpecAgainstSchema` to also `validatePlanAgainstCapabilities`.
- Ensure the plan references a valid capability ID and legal fields for that capability.

### 5. Update Chat & Engine
**Files:** `lib/ai/tool-chat.ts`, `lib/execution/engine.ts`
- **Chat:** Use the Planner to validate intent *before* generating the Dashboard Spec.
  - If Planner fails -> Chat explains why ("I can't filter by 'foo' because GitHub doesn't support it").
- **Engine:** Execute the *Plan* via the *Synthesizer* instead of raw resource mapping.
  - `executeDashboard` -> `plan` -> `synthesize` -> `executor.execute`.

## Verification Plan
1.  **Unit Test:** Test `planExecution` with ambiguous inputs (should fail) and valid inputs (should succeed).
2.  **Synthesis Test:** Verify `synthesizeQuery` produces correct API params for GitHub/Linear.
3.  **End-to-End:** Chat "Show me open issues" -> Verify Planner selects `github_issues_list` with `state: open`.
