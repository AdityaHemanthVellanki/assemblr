I will fix the issues where execution results are not correctly rendered in chat, and misleading success messages are shown.

### **1. Make Execution Result the Single Source of Truth**
**File:** `lib/ai/tool-chat.ts`
- **Change:** Refactor the Ephemeral Mode response logic (lines 331-373) to be strictly data-driven.
- **Logic:**
  - Instead of constructing a markdown string manually, we will format the data into a readable structure based on the resource type.
  - Specifically for `commits`, we will render a rich list (Message, Author, Date, SHA) as requested.
  - We will REMOVE the generic "Here is what I found" and "I've fetched the data for you" prefixes/explanations unless data is actually present.

### **2. Enforce Strict Execution -> Render Contract**
**File:** `lib/ai/tool-chat.ts`
- **Change:** Ensure that the `explanation` field in the return object is derived **solely** from the execution outcome.
- **Logic:**
  - `status === "success"` AND `rows.length > 0`: Render data + "Here are the latest [resource]..."
  - `status === "success"` AND `rows.length === 0`: "I searched for [resource] but found no results."
  - `status === "error"`: "I encountered an error: [error message]"
  - This removes any possibility of "I've fetched the data" when `rows` is empty or execution failed.

### **3. Render GitHub Results Inline (Mandatory)**
**File:** `lib/ai/tool-chat.ts`
- **Change:** Add a specific formatter for GitHub commits in the response generation block.
- **Logic:**
  - Detect if `plan.resource === "commits"`.
  - If so, map the rows to a markdown list:
    ```markdown
    **Latest commits in [repo]:**
    - **[message]**
      - Author: [author.name]
      - Date: [date]
      - SHA: [sha]
    ```
  - For other resources, fallback to the existing JSON block or a simple list if applicable.

### **4. Remove Generic Success Messages**
**File:** `lib/ai/tool-chat.ts`
- **Change:** Delete the hardcoded strings "Here is what I found:" and "I've fetched the data for you."
- **Logic:** Replace them with dynamic headers based on the resource name (e.g., "**Issues** (5 found):").

### **5. Ensure Dashboard is Opt-In**
**File:** `lib/ai/tool-chat.ts`
- **Verification:** The existing logic (lines 327-329) already checks `isMaterialize`. We will ensure that this flag is ONLY set if the user explicitly asks for persistence (which the planner handles). The logic I'm modifying is inside the `!isMaterialize` block, ensuring no dashboard mutations occur for these queries.

### **Plan of Action**
1.  **Modify `lib/ai/tool-chat.ts`**:
    -   Rewrite the response generation loop for Ephemeral Mode.
    -   Add specific formatting logic for `commits`, `issues`, and `repos`.
    -   Implement the strict "No Data = No Success Message" rule.
2.  **Verify**:
    -   Check that `processToolChat` returns the correct `explanation` and `content` for a commit search.
    -   Confirm empty results return a "No results" explanation.
    -   Confirm errors return an error explanation.