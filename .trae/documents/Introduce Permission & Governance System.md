# Introduce Permission & Governance System (Phase 9)

I will implement a comprehensive Governance System including RBAC, Audit Logs, and Approval Flows to make Assemblr enterprise-ready and safe.

## Implementation Steps

### 1. Database Schema Update
**File:** `supabase/migrations/20251230220000_governance.sql`
- Create `audit_logs` table:
  - `id`, `actor_id`, `action`, `target_resource`, `target_id`, `metadata`, `timestamp`.
- Create `approvals` table:
  - `id`, `workflow_id`, `requested_by`, `approved_by`, `status`, `created_at`, `resolved_at`.
- Update `workflows` table:
  - Add `approval_status` (pending | approved | rejected).
  - Add `requires_approval` (boolean) default true for write actions.

### 2. Implement Governance Store
**File:** `lib/governance/store.ts`
- `logAudit(event)`: Append-only log writer.
- `createApprovalRequest(workflowId)`: Create pending approval.
- `approveWorkflow(approvalId)`: Update status and enable workflow.
- `rejectWorkflow(approvalId)`: Update status.

### 3. Update Permissions Logic
**File:** `lib/auth/permissions.ts`
- Add `canCreateWorkflows`, `canApproveWorkflows`.
- Define "Risky Actions" logic (e.g., any workflow with side effects requires Admin approval).
- **Permissions Matrix:**
  - `viewer`: Read-only.
  - `editor`: Create metrics/alerts. Create workflows (pending approval).
  - `owner`: Approve workflows. Manage permissions.

### 4. Enforce Permissions in Engines
**File:** `lib/workflows/store.ts`
- Update `createWorkflow` to check permissions and set `approval_status = 'pending'` if risky.

**File:** `lib/workflows/engine.ts`
- Update `runWorkflow` to CHECK `approval_status === 'approved'` before execution.
- If not approved, throw "Governance Error".

**File:** `lib/execution/scheduler.ts`
- Ensure scheduled workflows respect approval status.

### 5. Chat Integration
**File:** `lib/ai/planner.ts`
- Update `planExecution` instructions:
  - "If creating a workflow with write actions, warn user about approval requirement."
- Chat tool handler (`lib/ai/tool-chat.ts`) should catch permission errors and explain them nicely.

## Verification Plan
1.  **RBAC:** Try to create workflow as `viewer` -> Fail.
2.  **Approval:** Create workflow as `editor`. Verify status is `pending`.
3.  **Safety:** Try to run pending workflow. Verify failure.
4.  **Audit:** Perform actions. Check `audit_logs` table for records.
5.  **Admin:** Approve workflow as `owner`. Verify status `approved`. Run workflow -> Success.
