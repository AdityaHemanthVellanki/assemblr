I will fix the issues where validation failures block execution and chat responses are misleading.

### **1. Make Capability Parameter Validation Permissive**
**File:** `lib/execution/validation.ts`
- **Change:** Modify `validatePlanAgainstCapabilities` to **warn** instead of **fail** when unsupported parameters are encountered.
- **Logic:**
  - Iterate through `plan.params`.
  - If a parameter is not in `capability.supportedFields`:
    - Log a warning (e.g., `[Validation Warning] Parameter "sort" is not supported`).
    - **Continue** validation (do not return `valid: false`).
  - This ensures the planner's "creativity" (e.g., adding `sort`) doesn't block valid execution.

### **2. Enforce Execution Truth in Chat**
**File:** `lib/ai/tool-chat.ts`
- **Change:** Update the Ephemeral Mode response logic to accurately reflect the execution outcome.
- **Logic:**
  - In the `!isMaterialize` block:
    - Check if `successfulExecutions` contains any actual data rows.
    - **If rows > 0:** Return success message ("I've fetched the data...").
    - **If rows == 0:** Return a "No results" message ("I executed the query but found no data.") instead of a generic success message.
  - This ensures the chat never claims to have "fetched data" when none was returned.

### **3. Verify GitHub Executor Robustness**
**File:** `lib/integrations/executors/github.ts`
- **Verification:** Confirmed that `GitHubExecutor` only reads specific parameters (e.g., `repo`) and ignores others. No code change needed here as it already satisfies the "adapt, not fail" requirement for extra parameters like `sort`.

### **4. Confirm Dashboard Safety**
**File:** `lib/ai/tool-chat.ts`
- **Verification:** The existing logic strictly separates `ephemeral` (chat-only) and `materialize` (dashboard update) modes. By fixing the validation blocking, we ensure ephemeral queries flow correctly without falling through to spec generation.

### **Validation Plan**
1.  **Test Permissive Validation:** Simulate a plan with an extra `sort` parameter. Verify it logs a warning but proceeds to execution.
2.  **Test Chat Truthfulness:** Simulate an execution that returns 0 rows. Verify chat says "No data found" instead of "I've fetched the data".
3.  **Test Ephemeral Safety:** Confirm that simple queries do not trigger `generateSpecUpdate` or modify the dashboard.