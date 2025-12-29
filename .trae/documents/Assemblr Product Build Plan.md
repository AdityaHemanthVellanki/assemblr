I will implement the **Assemblr Dashboard & Tool Builder** as requested.

### **1. Architecture & Data Model**
*   **Projects as Tools**: I will use the existing `projects` table to store tools. The `spec` JSON column will store the tool definition.
*   **Chat History**: I will create a new `chat_messages` table to persist conversation history for each tool.
    *   `id` (uuid, pk)
    *   `project_id` (uuid, fk to projects)
    *   `role` (user/assistant)
    *   `content` (text)
    *   `created_at` (timestamp)
*   **AI Logic**: I will enhance the existing AI generation to be "stateful" by including chat history in the prompt context.

### **2. Implementation Plan**

#### **Phase 1: Database & Backend**
1.  **Migration**: Create `chat_messages` table with RLS policies (view/insert for project owners/editors).
2.  **Chat API**: Create `POST /api/projects/[id]/chat` to:
    *   Accept user message.
    *   Fetch project context (current spec + recent chat history).
    *   Call Azure OpenAI to interpret intent and generate updated spec.
    *   Save user message, assistant message, and updated spec to DB.
    *   Return the response.

#### **Phase 2: Frontend - Workspace (Split View)**
1.  **Layout**: Replace the current `projects/[id]/page.tsx` with a **Split View**:
    *   **Left (Chat)**: A persistent chat interface (`ChatPanel`) that loads history and sends new messages.
    *   **Right (Renderer)**: A live preview (`ToolRenderer`) that reacts to `spec` changes in real-time.
2.  **Tool Renderer**: Update the renderer to support the dashboard spec (Metrics, Charts, Tables) securely.

#### **Phase 3: Frontend - Catalog (Home)**
1.  **Dashboard Home**: Update `/dashboard/page.tsx` to display a grid of user's tools (projects).
2.  **Create Flow**: Ensure "Create Tool" button creates a fresh project and redirects to the chat workspace.

### **3. Validation**
*   **Security**: Verify RLS prevents unauthorized access to chat/specs.
*   **Functionality**: Verify a full loop: Create Tool -> Chat "Add a chart" -> AI updates spec -> Chart appears.
