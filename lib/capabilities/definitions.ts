
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
  {
    id: "github_commit_status_list",
    integrationId: "github",
    resource: "commit_status",
    allowedOperations: ["read", "filter"],
    supportedFields: ["owner", "repo", "sha"],
    constraints: { requiredFilters: ["repo", "sha"] },
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
  {
    id: "google_gmail_reply",
    integrationId: "google",
    resource: "gmail",
    allowedOperations: [],
    supportedFields: ["messageId", "body", "subject"],
  },
  {
    id: "google_gmail_archive",
    integrationId: "google",
    resource: "gmail",
    allowedOperations: [],
    supportedFields: ["messageId"],
  },
  {
    id: "google_gmail_label",
    integrationId: "google",
    resource: "gmail",
    allowedOperations: [],
    supportedFields: ["messageId", "labelIds"],
  },
  {
    id: "github_issue_comment",
    integrationId: "github",
    resource: "issues",
    allowedOperations: [],
    supportedFields: ["owner", "repo", "issueNumber", "body"],
  },
  {
    id: "github_issue_close",
    integrationId: "github",
    resource: "issues",
    allowedOperations: [],
    supportedFields: ["owner", "repo", "issueNumber"],
  },
  {
    id: "github_issue_assign",
    integrationId: "github",
    resource: "issues",
    allowedOperations: [],
    supportedFields: ["owner", "repo", "issueNumber", "assignees"],
  },
  {
    id: "linear_issue_update_status",
    integrationId: "linear",
    resource: "issues",
    allowedOperations: [],
    supportedFields: ["issueId", "stateId"],
  },
  {
    id: "linear_issue_assign",
    integrationId: "linear",
    resource: "issues",
    allowedOperations: [],
    supportedFields: ["issueId", "assigneeId"],
  },
  {
    id: "linear_issue_comment",
    integrationId: "linear",
    resource: "issues",
    allowedOperations: [],
    supportedFields: ["issueId", "body"],
  },
  {
    id: "slack_post_message",
    integrationId: "slack",
    resource: "messages",
    allowedOperations: [],
    supportedFields: ["channel", "text"],
  },
  {
    id: "slack_reply_thread",
    integrationId: "slack",
    resource: "messages",
    allowedOperations: [],
    supportedFields: ["channel", "threadTs", "text"],
  },
  {
    id: "slack_add_reaction",
    integrationId: "slack",
    resource: "reactions",
    allowedOperations: [],
    supportedFields: ["channel", "timestamp", "name"],
  },
  {
    id: "notion_page_create",
    integrationId: "notion",
    resource: "pages",
    allowedOperations: [],
    supportedFields: ["parentId", "properties", "children"],
  },
  {
    id: "notion_page_update",
    integrationId: "notion",
    resource: "pages",
    allowedOperations: [],
    supportedFields: ["pageId", "properties"],
  },
  {
    id: "notion_block_append",
    integrationId: "notion",
    resource: "blocks",
    allowedOperations: [],
    supportedFields: ["blockId", "children"],
  },
];
