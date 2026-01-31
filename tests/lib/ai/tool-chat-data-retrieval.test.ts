
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resumeToolExecution } from "@/lib/ai/tool-chat";
import { IntegrationNotConnectedError } from "@/lib/errors/integration-errors";

// Mock dependencies
vi.mock("@/lib/toolos/executions", () => ({
  getExecutionById: vi.fn(),
  updateExecution: vi.fn(),
  completeExecution: vi.fn(),
  acquireExecutionLock: vi.fn(),
}));

vi.mock("@/lib/toolos/compiler/stages/check-integration-readiness", () => ({
  runCheckIntegrationReadiness: vi.fn(),
}));

vi.mock("@/lib/toolos/runtime", () => ({
  executeToolAction: vi.fn(),
}));

vi.mock("@/lib/toolos/answer-contract", () => ({
  validateFetchedData: vi.fn(),
}));

vi.mock("@/lib/toolos/goal-validation", () => ({
  evaluateGoalSatisfaction: vi.fn(),
  decideRendering: vi.fn(),
  buildEvidenceFromDerivedIncidents: vi.fn(),
  evaluateRelevanceGate: vi.fn(),
}));

vi.mock("@/lib/toolos/materialization", () => ({
  buildSnapshotRecords: vi.fn(),
  finalizeToolEnvironment: vi.fn(),
}));

// Mock Supabase clients
const mockRpc = vi.fn();
const mockFrom = vi.fn(() => ({
    select: vi.fn(() => ({
        eq: vi.fn(() => ({
            eq: vi.fn(() => ({
                maybeSingle: vi.fn(() => ({ data: { tool_id: "tool-123", view_ready: true, data_ready: true }, error: null })),
                single: vi.fn(() => ({ data: { id: "tool-123", view_ready: true, data_ready: true }, error: null })),
            })),
            single: vi.fn(() => ({ data: { id: "tool-123", view_ready: true, data_ready: true }, error: null })),
        })),
    })),
    update: vi.fn(() => ({ eq: vi.fn(() => ({ error: null })) })),
    upsert: vi.fn(() => ({ error: null })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({
    rpc: mockRpc,
    from: mockFrom,
  })),
}));

import { getExecutionById, updateExecution } from "@/lib/toolos/executions";
import { runCheckIntegrationReadiness } from "@/lib/toolos/compiler/stages/check-integration-readiness";
import { executeToolAction } from "@/lib/toolos/runtime";
import { validateFetchedData } from "@/lib/toolos/answer-contract";
import { evaluateGoalSatisfaction, decideRendering } from "@/lib/toolos/goal-validation";
import { buildSnapshotRecords, finalizeToolEnvironment } from "@/lib/toolos/materialization";

describe("resumeToolExecution - Data Retrieval Flow", () => {
  const mockExecutionId = "exec-123";
  const mockOrgId = "org-123";
  const mockToolId = "tool-123";
  const mockUserId = "user-123";
  const mockSpec = {
    integrations: [{ id: "google" }],
    actions: [{ id: "google_gmail_list", type: "READ", integrationId: "google" }],
    query_plans: [{ actionId: "google_gmail_list", query: {} }],
    goal_plan: { kind: "DATA_RETRIEVAL" },
    intent_contract: {},
    answer_contract: {},
  };
  const mockCompiledTool = {};

  beforeEach(() => {
    vi.resetAllMocks();
    (getExecutionById as any).mockResolvedValue({
      id: mockExecutionId,
      status: "created",
      orgId: mockOrgId,
      userId: mockUserId,
    });
    (runCheckIntegrationReadiness as any).mockResolvedValue({ status: "completed" });
    (executeToolAction as any).mockResolvedValue({
        output: [{ id: "msg1" }],
        events: []
    });
    (validateFetchedData as any).mockReturnValue({
        outputs: [{ action: { id: "google_gmail_list" }, output: [{ id: "msg1" }] }],
        violations: []
    });
    (evaluateGoalSatisfaction as any).mockReturnValue({
        satisfied: true,
        level: "satisfied"
    });
    (decideRendering as any).mockReturnValue({
        kind: "render",
        viewId: "default"
    });
    (buildSnapshotRecords as any).mockReturnValue({
        integrations: { google: { data: [{ id: "msg1" }] } }
    });
    (finalizeToolEnvironment as any).mockResolvedValue({
        status: "MATERIALIZED"
    });
    mockRpc.mockResolvedValue({ error: null });
  });

  it("should set data_ready=true and view_ready=true when records exist", async () => {
    const response = await resumeToolExecution({
      executionId: mockExecutionId,
      orgId: mockOrgId,
      toolId: mockToolId,
      userId: mockUserId,
      prompt: "show my latest emails",
      spec: mockSpec as any,
      compiledTool: mockCompiledTool as any,
    });

    // Check evaluateGoalSatisfaction was called with hasData: true
    expect(evaluateGoalSatisfaction).toHaveBeenCalledWith(expect.objectContaining({
        hasData: true
    }));

    // Check finalize_tool_render_state was called with correct flags
    expect(mockRpc).toHaveBeenCalledWith("finalize_tool_render_state", expect.objectContaining({
        p_data_ready: true,
        p_view_ready: true
    }));
    
    expect(response.metadata?.data_ready).toBe(true);
    expect(response.metadata?.view_ready).toBe(true);
  });

  it("should set view_ready=true when records are empty (empty state)", async () => {
    // Mock empty data
    (executeToolAction as any).mockResolvedValue({ output: [] });
    
    // Mock decision to render empty state
    (evaluateGoalSatisfaction as any).mockReturnValue({
      level: "unsatisfied",
      satisfied: false,
      failure_reason: "no_failed_builds", // Example reason
    });
    (decideRendering as any).mockReturnValue({
      kind: "render",
      partial: true,
      explanation: "No results found."
    });

    const result = await resumeToolExecution({
      orgId: "org-1",
      toolId: "tool-1",
      executionId: "exec-1",
      prompt: "show my latest emails from last 1 hour",
      spec: mockSpec as any,
      compiledTool: mockCompiledTool as any,
    } as any);

    expect(result.metadata?.data_ready).toBe(false);
    expect(result.metadata?.view_ready).toBe(true);

    // Verify decision via RPC call
    expect(mockRpc).toHaveBeenCalledWith("finalize_tool_render_state", expect.objectContaining({
        p_view_spec: expect.objectContaining({
            decision: expect.objectContaining({
                kind: "render"
            })
        })
    }));
  });
});
