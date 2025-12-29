import { Capability } from "./capabilities";

export type AuthType = "oauth" | "api_key" | "database" | "none";

export interface IntegrationConnector {
  id: string;
  name: string;

  authType: AuthType;

  capabilities: readonly Capability[];

  connect(input: ConnectInput): Promise<ConnectResult>;

  fetch(input: FetchInput): Promise<NormalizedData>;

  act?(input: ActionInput): Promise<ActionResult>;
}

export type ConnectInput = {
  orgId: string;
  credentials: Record<string, string>;
};

export type ConnectResult = {
  success: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
};

export type FetchInput = {
  capability: Capability;
  parameters: Record<string, unknown>;
  timeRange?: {
    from: string;
    to: string;
  };
};

export type ActionInput = {
  action: string;
  payload: Record<string, unknown>;
};

export type ActionResult = {
  success: boolean;
  data?: unknown;
  error?: string;
};

export type NormalizedData = NormalizedTable | NormalizedEvents;

export type NormalizedTable = {
  type: "table";
  columns: { name: string; type: string }[];
  rows: unknown[][];
};

export type NormalizedEvents = {
  type: "events";
  events: {
    timestamp: string;
    properties: Record<string, unknown>;
  }[];
};
