import { DashboardSpec } from "@/lib/spec/dashboardSpec";
import { ToolSpec } from "@/lib/spec/toolSpec";
import { CompiledIntent } from "./intent";

export type ToolRole = "owner" | "editor" | "viewer";

export type VersionStatus = "draft" | "active" | "archived";

export type ToolVersion = {
  id: string;
  tool_id: string;
  created_at: string; // ISO Date
  created_by: string; // User ID
  intent_summary: string;
  compiled_intent?: CompiledIntent;
  mini_app_spec: ToolSpec;
  execution_policy?: any;
  status: VersionStatus;
  diff?: VersionDiff;
  mode?: "persistent" | "ephemeral";
};

export type VersionDiff = {
  pages_added: string[]; // IDs
  pages_removed: string[];
  pages_modified: string[];
  actions_added: string[];
  actions_removed: string[];
  actions_modified: string[];
  integrations_changed: string[];
  permissions_changed: boolean;
};

export type VersionValidationResult = {
  valid: boolean;
  issues: ValidationIssue[];
};

export type ValidationIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  context?: any;
};
