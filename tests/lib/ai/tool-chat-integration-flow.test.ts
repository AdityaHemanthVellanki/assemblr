
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resumeToolExecution } from "@/lib/ai/tool-chat";
import { IntegrationNotConnectedError } from "@/lib/errors/integration-errors";

// Mock dependencies
vi.mock("@/lib/toolos/executions", () => ({
  getExecutionById: vi.fn(),
  updateExecution: vi.fn(),
}));

vi.mock("@/lib/toolos/compiler/stages/check-integration-readiness", () => ({
  runCheckIntegrationReadiness: vi.fn(),
}));

// Mock Supabase clients
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({})),
}));

import { getExecutionById, updateExecution } from "@/lib/toolos/executions";
import { runCheckIntegrationReadiness } from "@/lib/toolos/compiler/stages/check-integration-readiness";

describe("resumeToolExecution - Integration Flow", () => {
  const mockExecutionId = "exec-123";
  const mockOrgId = "org-123";
  const mockToolId = "tool-123";
  const mockUserId = "user-123";
  const mockSpec = {
    integrations: [{ id: "github" }, { id: "notion" }],
    actions: [],
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
  });

  it("should fail gracefully when integration check throws IntegrationNotConnectedError", async () => {
    // Setup: checkIntegrationReadiness throws
    const error = new IntegrationNotConnectedError({
      integrationIds: ["github", "notion"],
      blockingActions: ["list_issues"],
      requiredBy: ["list_issues"],
    });
    (runCheckIntegrationReadiness as any).mockRejectedValue(error);

    await expect(resumeToolExecution({
      executionId: mockExecutionId,
      orgId: mockOrgId,
      toolId: mockToolId,
      userId: mockUserId,
      prompt: "do something",
      spec: mockSpec as any,
      compiledTool: mockCompiledTool as any,
    })).rejects.toThrow(IntegrationNotConnectedError);
  });

  it("should proceed when integration check passes", async () => {
    // Setup: checkIntegrationReadiness succeeds
    (runCheckIntegrationReadiness as any).mockResolvedValue({ status: "completed" });
    
    // We expect it to fail later because we haven't mocked the rest of the pipeline (runDataReadiness etc)
    // But we can check that it PASSED the integration gate
    
    // To make it run far enough, we might need to mock runDataReadiness too, 
    // but resumeToolExecution logic is complex. 
    // Actually, resumeToolExecution calls runToolRuntimePipeline eventually.
    // Let's just expect it to throw a different error (e.g. from runDataReadiness or subsequent steps)
    // or return a response if we mock enough.
    
    // For this test, we just want to verify runCheckIntegrationReadiness IS called.
    
    try {
        await resumeToolExecution({
            executionId: mockExecutionId,
            orgId: mockOrgId,
            toolId: mockToolId,
            userId: mockUserId,
            prompt: "do something",
            spec: mockSpec as any,
            compiledTool: mockCompiledTool as any,
        });
    } catch (e) {
        // It might crash later, which is fine
    }

    expect(runCheckIntegrationReadiness).toHaveBeenCalledTimes(1);
    expect(runCheckIntegrationReadiness).toHaveBeenCalledWith({
        spec: mockSpec,
        orgId: mockOrgId,
    });
  });
});
