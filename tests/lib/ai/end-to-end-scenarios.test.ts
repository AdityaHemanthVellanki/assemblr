
import { describe, it, expect, vi, beforeEach } from "vitest";
import { runCheckIntegrationReadiness } from "@/lib/toolos/compiler/stages/check-integration-readiness";
import { IntegrationNotConnectedError } from "@/lib/errors/integration-errors";

// Mock dependencies
const mockLoadIntegrationConnections = vi.fn();
const mockCreateSupabaseAdminClient = vi.fn();

describe("End-to-End Scenarios: Integration Awareness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSupabaseAdminClient.mockReturnValue({
        from: () => ({ select: () => ({ eq: () => ({ single: () => ({ data: {} }) }) }) })
    });
  });

  it("Case 1: Missing GitHub - should throw IntegrationNotConnectedError", async () => {
    // Setup: Tool requires GitHub, but no connection exists
    const spec = {
      integrations: [{ id: "github" }],
      actions: [{ name: "List Issues", integrationId: "github" }],
    };
    const orgId = "org_123";
    
    // Mock connections returning empty list
    mockLoadIntegrationConnections.mockResolvedValue([]);

    // Execute
    try {
      await runCheckIntegrationReadiness(
        { spec: spec as any, orgId }, 
        { 
            createSupabaseAdminClient: mockCreateSupabaseAdminClient,
            loadIntegrationConnections: mockLoadIntegrationConnections
        }
      );
      // Should fail
      expect(true).toBe(false); 
    } catch (err) {
      expect(err).toBeInstanceOf(IntegrationNotConnectedError);
      const error = err as IntegrationNotConnectedError;
      expect(error.integrationIds).toContain("github");
      expect(error.blockingActions).toContain("List Issues");
    }
  });

  it("Case 2: After Connecting GitHub - should succeed", async () => {
    // Setup: GitHub connected
    const spec = {
      integrations: [{ id: "github" }],
      actions: [{ name: "List Issues", integrationId: "github" }],
    };
    const orgId = "org_123";
    
    // Mock connections returning GitHub
    mockLoadIntegrationConnections.mockResolvedValue([{ integration_id: "github" }]);

    // Execute
    const result = await runCheckIntegrationReadiness(
        { spec: spec as any, orgId },
        {
            createSupabaseAdminClient: mockCreateSupabaseAdminClient,
            loadIntegrationConnections: mockLoadIntegrationConnections
        }
    );

    // Verify
    expect(result.status).toBe("completed");
  });

  it("Case 3: Multiple Integrations Missing - should report all missing integrations", async () => {
    // Setup: Requires GitHub and Notion
    const spec = {
      integrations: [{ id: "github" }, { id: "notion" }],
      actions: [
        { name: "List Issues", integrationId: "github" },
        { name: "List Pages", integrationId: "notion" }
      ],
    };
    const orgId = "org_123";
    
    // Mock connections returning nothing
    mockLoadIntegrationConnections.mockResolvedValue([]);

    // Execute
    try {
      await runCheckIntegrationReadiness(
        { spec: spec as any, orgId },
        {
            createSupabaseAdminClient: mockCreateSupabaseAdminClient,
            loadIntegrationConnections: mockLoadIntegrationConnections
        }
    );
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(IntegrationNotConnectedError);
      const error = err as IntegrationNotConnectedError;
      expect(error.integrationIds).toContain("github");
      expect(error.integrationIds).toContain("notion");
      expect(error.blockingActions).toContain("List Issues");
      expect(error.blockingActions).toContain("List Pages");
    }
  });

  it("Case 4: Action-only dependency - should detect missing integration even if not in top-level list", async () => {
    // Setup: Action implies integration
    const spec = {
      integrations: [], // Empty top-level
      actions: [{ name: "List Issues", integrationId: "github" }],
    };
    const orgId = "org_123";
    
    mockLoadIntegrationConnections.mockResolvedValue([]);

    try {
      await runCheckIntegrationReadiness(
        { spec: spec as any, orgId },
        {
            createSupabaseAdminClient: mockCreateSupabaseAdminClient,
            loadIntegrationConnections: mockLoadIntegrationConnections
        }
    );
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(IntegrationNotConnectedError);
      const error = err as IntegrationNotConnectedError;
      expect(error.integrationIds).toContain("github");
    }
  });
});
