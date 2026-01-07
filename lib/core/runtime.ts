import { z } from "zod";

export interface IntegrationRuntime {
  id: string;
  capabilities: Record<string, Capability>;
  resolveContext(token: string): Promise<Record<string, any>>;
}

export interface Capability {
  id: string;
  integrationId: string;
  paramsSchema: z.ZodSchema;
  autoResolvedParams?: string[];
  execute(params: any, context: any): Promise<any>;
}
