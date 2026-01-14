export const ACTION_TYPES = {
  INTEGRATION_CALL: "integration_call",
  INTERNAL: "internal",
  NAVIGATION: "navigation",
  WORKFLOW: "workflow",
} as const;

export type ActionType = (typeof ACTION_TYPES)[keyof typeof ACTION_TYPES];
