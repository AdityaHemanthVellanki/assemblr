
import { ZodSchema } from "zod";

// --- Integration ABI ---
export interface IntegrationABI {
  register(definition: IntegrationDefinition): void;
  get(id: string): IntegrationDefinition | undefined;
  list(): IntegrationDefinition[];
}

export type IntegrationDomain =
  | "databases"
  | "analytics"
  | "finance"
  | "crm"
  | "marketing"
  | "engineering"
  | "infrastructure"
  | "files"
  | "hr"
  | "messaging"
  | "generic_api"
  | "ai"
  | "productivity";

export interface IntegrationDefinition {
  id: string;
  name: string;
  domain: IntegrationDomain;
  description?: string;
  authType: "oauth" | "api_key" | "none";
  scopes?: string[];
  logoUrl?: string;
}

// --- Capability ABI ---
export interface CapabilityABI {
  register(definition: CapabilityDefinition): void;
  get(id: string): CapabilityDefinition | undefined;
  list(): CapabilityDefinition[];
  execute(capabilityId: string, params: any, context: any): Promise<any>;
}

export interface CapabilityDefinition {
  id: string;
  integrationId: string;
  description: string;
  mode: "read" | "write" | "action";
  paramsSchema: ZodSchema | any; // Using any for flexibility with JSON schema or Zod
  permissionsRequired?: string[];
  execute: (params: any, context: any) => Promise<any>;
}

// --- Agent ABI ---
export interface AgentABI {
  register(definition: AgentDefinition): void;
  get(id: string): AgentDefinition | undefined;
  list(): AgentDefinition[];
}

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  execute: (objective: string, context: any) => Promise<any>;
}

// --- UI ABI ---
export interface UIABI {
  registerComponent(name: string, component: any, schema?: any): void;
  getComponent(name: string): any;
}

// --- Execution ABI ---
export interface ExecutionABI {
  emitTrace(traceId: string, event: any): void;
  getTrace(traceId: string): any;
}

// --- Main Assemblr ABI ---
export interface AssemblrABI {
  version: string;
  integrations: IntegrationABI;
  capabilities: CapabilityABI;
  agents: AgentABI;
  ui: UIABI;
  execution: ExecutionABI;
}
