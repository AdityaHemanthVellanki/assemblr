
import { describe, it, expect, vi } from "vitest";
import { runCheckIntegrationReadiness } from "../../../../../lib/toolos/compiler/stages/check-integration-readiness";
import { IntegrationNotConnectedError } from "../../../../../lib/errors/integration-errors";

describe("check-integration-readiness", () => {
  const mockOrgId = "org-123";
  const mockUserId = "user-123";

  it("should pass if no integrations are required", async () => {
    const ctx = {
      spec: { integrations: [], actions: [] },
      orgId: mockOrgId,
    } as any;

    const result = await runCheckIntegrationReadiness(ctx);
    expect(result).toEqual({ status: "completed" });
  });

  it("should pass if all required integrations are connected", async () => {
    const ctx = {
      spec: {
        integrations: [{ id: "github" }, { id: "notion" }],
        actions: [],
      },
      orgId: mockOrgId,
    } as any;

    const mockLoadConnections = vi.fn().mockResolvedValue([
      { integration_id: "github", status: "active" },
      { integration_id: "notion", status: "active" },
    ]);

    const mockCreateClient = vi.fn().mockReturnValue({});

    await runCheckIntegrationReadiness(ctx, {
      loadIntegrationConnections: mockLoadConnections,
      createSupabaseAdminClient: mockCreateClient,
    });

    expect(mockLoadConnections).toHaveBeenCalledWith({
      supabase: expect.anything(),
      orgId: mockOrgId,
    });
  });

  it("should throw IntegrationNotConnectedError if one integration is missing", async () => {
    const ctx = {
      spec: {
        integrations: [{ id: "github" }, { id: "notion" }],
        actions: [
          { name: "list_issues", integrationId: "github" },
          { name: "create_page", integrationId: "notion" },
        ],
      },
      orgId: mockOrgId,
    } as any;

    const mockLoadConnections = vi.fn().mockResolvedValue([
      { integration_id: "github", status: "active" },
    ]);

    const mockCreateClient = vi.fn().mockReturnValue({});

    try {
      await runCheckIntegrationReadiness(ctx, {
        loadIntegrationConnections: mockLoadConnections,
        createSupabaseAdminClient: mockCreateClient,
      });
      expect.fail("Should have thrown IntegrationNotConnectedError");
    } catch (err: any) {
      expect(err).toBeInstanceOf(IntegrationNotConnectedError);
      expect(err.integrationIds).toEqual(["notion"]);
      expect(err.blockingActions).toEqual(["create_page"]);
    }
  });

  it("should throw IntegrationNotConnectedError if multiple integrations are missing", async () => {
    const ctx = {
      spec: {
        integrations: [{ id: "github" }, { id: "notion" }],
        actions: [
          { name: "list_issues", integrationId: "github" },
          { name: "create_page", integrationId: "notion" },
        ],
      },
      orgId: mockOrgId,
    } as any;

    const mockLoadConnections = vi.fn().mockResolvedValue([]);

    const mockCreateClient = vi.fn().mockReturnValue({});

    try {
      await runCheckIntegrationReadiness(ctx, {
        loadIntegrationConnections: mockLoadConnections,
        createSupabaseAdminClient: mockCreateClient,
      });
      expect.fail("Should have thrown IntegrationNotConnectedError");
    } catch (err: any) {
      expect(err).toBeInstanceOf(IntegrationNotConnectedError);
      expect(err.integrationIds).toEqual(["github", "notion"]);
      expect(err.blockingActions).toEqual(["list_issues", "create_page"]);
    }
  });
});
