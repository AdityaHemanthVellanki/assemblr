/**
 * Core types for the Integration Seeder Engine.
 *
 * The seeder creates real resources across connected integrations
 * to produce realistic multi-tool workflows for skill graph testing.
 */

export type SeederIntegration =
  | "github"
  | "slack"
  | "linear"
  | "notion"
  | "hubspot"
  | "trello"
  | "asana"
  | "clickup"
  | "gitlab"
  | "outlook"
  | "discord"
  | "zoom"
  | "airtable";

export const SEED_TAG = "[ASSEMBLR_SEED]";

/** A single step in a seed scenario. */
export interface SeedStep {
  /** Unique ID for this step (used for dependency resolution). */
  id: string;
  /** Which integration this step targets. */
  integration: SeederIntegration;
  /** Human-readable action name (e.g., "create_issue", "send_message"). */
  action: string;
  /** Composio action name to execute. */
  composioAction: string;
  /** Input payload — may contain `{{stepId.field}}` template refs. */
  payload: Record<string, any>;
  /** IDs of steps this one depends on (executed first, results available). */
  dependsOn?: string[];
  /** What type of resource this step creates (for cleanup). */
  resourceType?: string;
  /** JSON path to extract the created resource's ID from the response. */
  resourceIdPath?: string;
}

/** A complete seed scenario (ordered multi-step workflow). */
export interface SeedScenario {
  name: string;
  description: string;
  /** Required integrations — scenario is skipped if any are missing. */
  requiredIntegrations: SeederIntegration[];
  steps: SeedStep[];
}

/** Result of executing a single step. */
export interface StepResult {
  stepId: string;
  integration: string;
  action: string;
  composioAction: string;
  status: "success" | "error";
  externalResourceId?: string;
  externalResourceType?: string;
  data?: any;
  error?: string;
  durationMs: number;
}

/** Result of a complete seeder execution. */
export interface SeederResult {
  executionId: string;
  orgId: string;
  scenario: string;
  status: "completed" | "failed" | "partial";
  steps: StepResult[];
  resourceCount: number;
  totalDurationMs: number;
  error?: string;
}

/** Existing types kept for profile-based bulk seeding. */
export interface SeederProfile {
  id: string;
  name: string;
  description: string;
  teamCount: number;
  userCount: number;
  github: {
    repoCount: number;
    issuesPerRepo: number;
    prsPerRepo: number;
    historyDays: number;
  };
  linear: {
    projectsPerTeam: number;
    issuesPerProject: number;
    cyclesPerTeam: number;
  };
  slack: {
    channelsPerTeam: number;
    messagesPerChannel: number;
    incidentChance: number;
  };
  notion: {
    docsPerProject: number;
  };
}

export interface SyntheticEntity {
  id: string;
  type: string;
  integration: SeederIntegration;
  metadata: Record<string, any>;
}

export type SeederLog = (level: "info" | "warn" | "error", message: string) => void;
