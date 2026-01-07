
export type CapabilityOperation = "read" | "aggregate" | "filter" | "group";

export interface Capability {
  id: string;
  integrationId: string;
  resource: string;
  allowedOperations: CapabilityOperation[];
  supportedFields: string[]; // Fields that can be selected/filtered
  constraints?: {
    maxLimit?: number;
    requiredFilters?: string[];
  };
}

export const CAPABILITY_REGISTRY: Capability[] = [
  // GitHub
  {
    id: "github_issues_list",
    integrationId: "github",
    resource: "issues",
    allowedOperations: ["read", "filter"],
    supportedFields: ["state", "labels", "assignee", "sort", "direction"],
  },
  {
    id: "github_repos_list",
    integrationId: "github",
    resource: "repos",
    allowedOperations: ["read", "filter"],
    supportedFields: ["type", "sort", "direction"],
  },
  {
    id: "github_commits_list",
    integrationId: "github",
    resource: "commits",
    allowedOperations: ["read", "filter"],
    supportedFields: ["repo", "author", "since", "until"],
    constraints: { requiredFilters: ["repo"] },
  },

  // Linear
  {
    id: "linear_issues_list",
    integrationId: "linear",
    resource: "issues",
    allowedOperations: ["read", "filter"],
    supportedFields: ["first", "includeArchived"],
  },
  {
    id: "linear_teams_list",
    integrationId: "linear",
    resource: "teams",
    allowedOperations: ["read"],
    supportedFields: [],
  },

  // Slack
  {
    id: "slack_channels_list",
    integrationId: "slack",
    resource: "channels",
    allowedOperations: ["read"],
    supportedFields: ["types", "exclude_archived"],
  },
  {
    id: "slack_messages_list",
    integrationId: "slack",
    resource: "messages",
    allowedOperations: ["read"],
    supportedFields: ["channel", "limit"],
    constraints: { requiredFilters: ["channel"] },
  },

  // Notion
  {
    id: "notion_pages_search",
    integrationId: "notion",
    resource: "pages",
    allowedOperations: ["read", "filter"],
    supportedFields: ["query", "sort"],
  },
  {
    id: "notion_databases_list",
    integrationId: "notion",
    resource: "databases",
    allowedOperations: ["read"],
    supportedFields: [],
  },

  // Google
  {
    id: "google_drive_list",
    integrationId: "google",
    resource: "drive",
    allowedOperations: ["read", "filter"],
    supportedFields: ["q", "orderBy", "pageSize"],
  },
  {
    id: "google_gmail_list",
    integrationId: "google",
    resource: "gmail",
    allowedOperations: ["read", "filter"],
    supportedFields: ["q", "maxResults", "includeSpamTrash"],
  },
];
