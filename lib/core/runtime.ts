import { z } from "zod";
import { ExecutionTracer } from "@/lib/observability/tracer";
import { Permission } from "./permissions";

export interface IntegrationRuntime {
  id: string;
  capabilities: Record<string, Capability>;
  resolveContext(token: string): Promise<Record<string, any>>;
  checkPermissions?(capabilityId: string, userPermissions: Permission[]): void;
}

export interface Capability {
  id: string;
  integrationId: string;
  paramsSchema: z.ZodSchema;
  autoResolvedParams?: string[];
  execute(params: any, context: any, trace?: ExecutionTracer): Promise<any>;
}
