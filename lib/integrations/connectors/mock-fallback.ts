import {
  IntegrationConnector,
  ConnectInput,
  ConnectResult,
  FetchInput,
  NormalizedData,
  NormalizedJson,
} from "../types";

export class MockFallbackConnector implements IntegrationConnector {
  id = "mock_fallback";
  name = "Mock Fallback";
  authType = "none" as const;
  capabilities = [] as const;

  async connect(_input: ConnectInput): Promise<ConnectResult> {
    // Always succeed for mock/prototype purposes
    // In a real system, this would be the "Generic OAuth" handler or similar
    return { success: true };
  }

  async fetch(input: FetchInput): Promise<NormalizedData> {
    return {
      type: "json",
      data: {
        message: "This is a mock response from the fallback connector.",
        capability: input.capability,
        parameters: input.parameters,
      },
    } as NormalizedJson;
  }
}
