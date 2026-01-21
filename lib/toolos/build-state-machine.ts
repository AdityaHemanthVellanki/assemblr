import { ToolLifecycleState } from "./spec";

export type ToolBuildState = ToolLifecycleState;

export type ToolBuildLog = {
  state: ToolBuildState;
  message: string;
  timestamp: string;
  level: "info" | "warn" | "error";
};

export class ToolBuildStateMachine {
  state: ToolBuildState = "INIT";
  logs: ToolBuildLog[] = [];

  transition(next: ToolBuildState, payload?: unknown, level: ToolBuildLog["level"] = "info") {
    const message = typeof payload === "string" ? payload : payload ? JSON.stringify(payload) : "";
    this.state = next;
    this.logs.push({
      state: next,
      message,
      timestamp: new Date().toISOString(),
      level,
    });
  }

  transitionTo(next: ToolBuildState, payload?: unknown, level: ToolBuildLog["level"] = "info") {
    this.transition(next, payload, level);
  }
}
