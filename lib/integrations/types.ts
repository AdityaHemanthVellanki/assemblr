import { Capability } from "./capabilities";

export type AuthType = "oauth" | "api_key" | "database" | "none";

export type ConnectionMode = "zero_input" | "oauth" | "guided" | "advanced";

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

export type NormalizedData =
  | NormalizedTable
  | NormalizedEvents
  | NormalizedMessages
  | NormalizedMetrics
  | NormalizedDocuments
  | NormalizedJson;

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

export type NormalizedMessages = {
  type: "messages";
  messages: {
    id: string;
    timestamp: string;
    sender: {
      id?: string;
      name?: string;
      email?: string;
    };
    content: string;
    channel?: string;
    metadata?: Record<string, unknown>;
  }[];
};

export type NormalizedMetrics = {
  type: "metrics";
  metrics: {
    name: string;
    value: number;
    timestamp: string;
    tags?: Record<string, string>;
  }[];
};

export type NormalizedDocuments = {
  type: "documents";
  documents: {
    id: string;
    title: string;
    content?: string;
    url?: string;
    mimeType?: string;
    lastModified?: string;
    metadata?: Record<string, unknown>;
  }[];
};

export type NormalizedJson = {
  type: "json";
  data: unknown;
};

export type IntegrationAuthSchema =
  | { type: "api_key"; fields: FieldDef[]; advancedFields?: FieldDef[] }
  | { type: "oauth"; scopes: string[]; advancedFields?: FieldDef[] }
  | { type: "database"; fields: FieldDef[]; advancedFields?: FieldDef[] }
  | { type: "none" };

export type FieldDef =
  | {
      kind: "string";
      id: string;
      label: string;
      placeholder?: string;
      required?: boolean;
      secret?: boolean;
    }
  | {
      kind: "number";
      id: string;
      label: string;
      placeholder?: string;
      required?: boolean;
    }
  | {
      kind: "boolean";
      id: string;
      label: string;
    };

export type IntegrationUIConfig = {
  id: string;
  name: string;
  category: string;
  logoUrl: string;
  description: string;
  connectionMode: ConnectionMode;
  auth: IntegrationAuthSchema;
};
