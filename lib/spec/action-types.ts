export const ACTION_TYPES = {
  INTEGRATION_CALL: "integration_call",
  INTEGRATION_QUERY: "integration_query", // Enforced for data fetching
  INTERNAL: "internal",
  NAVIGATION: "navigation",
  WORKFLOW: "workflow",
} as const;

export type ActionType = (typeof ACTION_TYPES)[keyof typeof ACTION_TYPES];
