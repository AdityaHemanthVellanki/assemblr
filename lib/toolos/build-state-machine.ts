export type ToolBuildState =
  | "INIT"
  | "INTENT_PARSED"
  | "NEEDS_CLARIFICATION"
  | "AWAITING_CLARIFICATION"
  | "VALIDATING_INTEGRATIONS"
  | "FETCHING_DATA"
  | "DATA_READY"
  | "BUILDING_VIEWS"
  | "READY"
  | "DEGRADED";

export type ToolBuildLog = {
  state: ToolBuildState;
  message: string;
  timestamp: string;
  level: "info" | "warn" | "error";
};

export class ToolBuildStateMachine {
  state: ToolBuildState = "INIT";
  logs: ToolBuildLog[] = [];

  transition(next: ToolBuildState, message: string, level: ToolBuildLog["level"] = "info") {
    this.state = next;
    this.logs.push({
      state: next,
      message,
      timestamp: new Date().toISOString(),
      level,
    });
  }
}
