export type ActionType = "READ" | "WRITE" | "MUTATE" | "NOTIFY";

export interface RegisteredAction {
  id: string;
  integrationId: string;
  displayName: string;
  description: string;
  actionType: ActionType;
  composioActionName: string;
  inputSchema: Record<string, any>;
  outputSchema: Record<string, any>;
  resource: string;
  requiredScopes: string[];
  discoveredAt: string;
  ttlHours: number;
}
