I will implement the required **Execution Result Render Pipeline** to ensure chat responses are strictly data-driven and visible.

### **1. Define Canonical `ExecutionResult`**
**File:** `lib/execution/types.ts`
- **Action:** Update the `ExecutionResult` type to match the required shape.
- **Change:**
  ```typescript
  export type ExecutionResult = {
    viewId: string;
    status: "success" | "error" | "clarification_needed";
    rows: unknown[]; // Keeping rows as 'data' equivalent for backward compatibility with existing code
    data?: any; // Add alias/field if needed, but 'rows' serves this purpose currently. I'll stick to 'rows' as the data carrier but ensure it's treated as the source of truth.
    error?: string;
    render_hint?: "list" | "table" | "json" | "text"; // New field
    timestamp: string;
    source: "live_api" | "cached" | "joined";
  };
  ```

### **2. Implement Default Result Renderer in Chat**
**File:** `lib/ai/tool-chat.ts`
- **Action:** Refactor the Ephemeral Mode response generation block.
- **Logic:**
  - **Iterate `successfulExecutions`**:
    - **Guard:** `if (status === "success" && (!rows || rows.length === 0))` -> Handle as empty result.
    - **Render:**
      - **Commits:** Render markdown list (Message, Author, Date, SHA).
      - **Issues:** Render markdown list (Title, State, #ID).
      - **Default:** Render JSON block or bullet list.
  - **Truthfulness:**
    - If `totalRows > 0`: Return `explanation` = "Here are the results..." + Rendered Content.
    - If `totalRows == 0`: Return `explanation` = "No results found." (Strictly no success template).

### **3. Enforce Chat Truthfulness**
**File:** `lib/ai/tool-chat.ts`
- **Action:** Add the strict guard:
  ```typescript
  if (successfulExecutions.length > 0 && totalRows === 0) {
     // Return "No results" message, NOT success.
  }
  ```
- **Action:** Remove any remaining static success strings like "Here is what I found" if they are not followed by data.

### **Verification Plan**
1.  **Type Update:** Modify `lib/execution/types.ts`.
2.  **Logic Update:** Apply renderer changes to `lib/ai/tool-chat.ts`.
3.  **Verify:** Check that a commit query returns a visible list and an empty query returns a clear "No results" message.