
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
    id: "github_issues_search",
    integrationId: "github",
    resource: "issues",
    allowedOperations: ["read", "filter"],
    supportedFields: ["q", "sort", "order", "per_page"],
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
  {
    id: "github_pull_requests_search",
    integrationId: "github",
    resource: "pull_requests",
    allowedOperations: ["read", "filter"],
    supportedFields: ["q", "sort", "order", "per_page"],
  },
  {
    id: "github_pull_request_get",
    integrationId: "github",
    resource: "pull_requests",
    allowedOperations: ["read"],
    supportedFields: ["owner", "repo", "pull_number"],
    constraints: { requiredFilters: ["owner", "repo", "pull_number"] },
  },
  {
    id: "github_pull_request_reviews_list",
    integrationId: "github",
    resource: "pull_request_reviews",
    allowedOperations: ["read"],
    supportedFields: ["owner", "repo", "pull_number"],
    constraints: { requiredFilters: ["owner", "repo", "pull_number"] },
  },
  {
    id: "github_pull_request_comments_list",
    integrationId: "github",
    resource: "pull_request_comments",
    allowedOperations: ["read"],
    supportedFields: ["owner", "repo", "pull_number"],
    constraints: { requiredFilters: ["owner", "repo", "pull_number"] },
  },
  {
    id: "github_repo_get",
    integrationId: "github",
    resource: "repos",
    allowedOperations: ["read"],
    supportedFields: ["owner", "repo"],
    constraints: { requiredFilters: ["owner", "repo"] },
  },
  {
    id: "github_repo_collaborators_list",
    integrationId: "github",
    resource: "repo_collaborators",
    allowedOperations: ["read"],
    supportedFields: ["owner", "repo", "per_page"],
    constraints: { requiredFilters: ["owner", "repo"] },
  },

  // Linear
  {
    id: "linear_issues_list",
    integrationId: "linear",
    resource: "issues",
    allowedOperations: ["read", "filter"],
    supportedFields: [
      "first",
      "includeArchived",
      "assigneeId",
      "teamId",
      "cycleId",
      "stateId",
      "completedAfter",
      "completedBefore",
      "updatedAfter",
      "updatedBefore",
      "labels",
    ],
  },
  {
    id: "linear_teams_list",
    integrationId: "linear",
    resource: "teams",
    allowedOperations: ["read"],
    supportedFields: [],
  },
  {
    id: "linear_projects_list",
    integrationId: "linear",
    resource: "projects",
    allowedOperations: ["read"],
    supportedFields: ["first", "includeArchived"],
  },
  {
    id: "linear_cycles_list",
    integrationId: "linear",
    resource: "cycles",
    allowedOperations: ["read"],
    supportedFields: ["first", "includeArchived"],
  },
  {
    id: "linear_labels_list",
    integrationId: "linear",
    resource: "labels",
    allowedOperations: ["read"],
    supportedFields: ["first"],
  },
  {
    id: "linear_workflow_states_list",
    integrationId: "linear",
    resource: "workflow_states",
    allowedOperations: ["read"],
    supportedFields: ["first"],
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
  {
    id: "slack_thread_replies_list",
    integrationId: "slack",
    resource: "thread_replies",
    allowedOperations: ["read"],
    supportedFields: ["channel", "threadTs", "limit"],
    constraints: { requiredFilters: ["channel", "threadTs"] },
  },
  {
    id: "slack_users_list",
    integrationId: "slack",
    resource: "users",
    allowedOperations: ["read"],
    supportedFields: ["limit", "cursor"],
  },
  {
    id: "slack_search_messages",
    integrationId: "slack",
    resource: "search_messages",
    allowedOperations: ["read", "filter"],
    supportedFields: ["query", "count", "sort", "sort_dir"],
    constraints: { requiredFilters: ["query"] },
  },
  {
    id: "slack_conversation_info",
    integrationId: "slack",
    resource: "conversation_info",
    allowedOperations: ["read"],
    supportedFields: ["channel"],
    constraints: { requiredFilters: ["channel"] },
  },
  {
    id: "slack_files_list",
    integrationId: "slack",
    resource: "files",
    allowedOperations: ["read"],
    supportedFields: ["types", "count", "page"],
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
  {
    id: "notion_databases_query",
    integrationId: "notion",
    resource: "databases",
    allowedOperations: ["read", "filter"],
    supportedFields: ["databaseId", "filter", "sorts", "pageSize", "startCursor"],
    constraints: { requiredFilters: ["databaseId"] },
  },
  {
    id: "notion_database_retrieve",
    integrationId: "notion",
    resource: "databases",
    allowedOperations: ["read"],
    supportedFields: ["databaseId"],
    constraints: { requiredFilters: ["databaseId"] },
  },
  {
    id: "notion_page_retrieve",
    integrationId: "notion",
    resource: "pages",
    allowedOperations: ["read"],
    supportedFields: ["pageId"],
    constraints: { requiredFilters: ["pageId"] },
  },
  {
    id: "notion_block_children_list",
    integrationId: "notion",
    resource: "blocks",
    allowedOperations: ["read"],
    supportedFields: ["blockId"],
    constraints: { requiredFilters: ["blockId"] },
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
    id: "google_drive_file_get",
    integrationId: "google",
    resource: "drive_files",
    allowedOperations: ["read"],
    supportedFields: ["fileId", "fields"],
    constraints: { requiredFilters: ["fileId"] },
  },
  {
    id: "google_drive_permissions_list",
    integrationId: "google",
    resource: "drive_permissions",
    allowedOperations: ["read"],
    supportedFields: ["fileId", "pageSize"],
    constraints: { requiredFilters: ["fileId"] },
  },
  {
    id: "google_gmail_list",
    integrationId: "google",
    resource: "gmail",
    allowedOperations: ["read", "filter"],
    supportedFields: ["q", "maxResults", "includeSpamTrash"],
  },
  {
    id: "google_docs_get",
    integrationId: "google",
    resource: "docs",
    allowedOperations: ["read"],
    supportedFields: ["documentId"],
    constraints: { requiredFilters: ["documentId"] },
  },
  {
    id: "google_docs_create",
    integrationId: "google",
    resource: "docs",
    allowedOperations: [],
    supportedFields: ["title", "content"],
  },
  {
    id: "google_sheets_get",
    integrationId: "google",
    resource: "sheets",
    allowedOperations: ["read"],
    supportedFields: ["spreadsheetId", "ranges", "includeGridData"],
    constraints: { requiredFilters: ["spreadsheetId"] },
  },
  {
    id: "google_sheets_update",
    integrationId: "google",
    resource: "sheets",
    allowedOperations: [],
    supportedFields: ["spreadsheetId", "range", "values", "valueInputOption"],
    constraints: { requiredFilters: ["spreadsheetId", "range", "values"] },
  },
  {
    id: "google_slides_get",
    integrationId: "google",
    resource: "slides",
    allowedOperations: ["read"],
    supportedFields: ["presentationId"],
    constraints: { requiredFilters: ["presentationId"] },
  },
  {
    id: "google_calendar_list",
    integrationId: "google",
    resource: "calendar",
    allowedOperations: ["read", "filter"],
    supportedFields: ["calendarId", "timeMin", "timeMax", "maxResults", "orderBy", "singleEvents"],
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

  // HubSpot
  {
    id: "hubspot_contacts_list",
    integrationId: "hubspot",
    resource: "contacts",
    allowedOperations: ["read", "filter"],
    supportedFields: ["limit", "after", "properties", "associations", "archived"],
  },
  {
    id: "hubspot_deals_list",
    integrationId: "hubspot",
    resource: "deals",
    allowedOperations: ["read", "filter"],
    supportedFields: ["limit", "after", "properties", "associations", "archived"],
  },
  {
    id: "hubspot_companies_list",
    integrationId: "hubspot",
    resource: "companies",
    allowedOperations: ["read", "filter"],
    supportedFields: ["limit", "after", "properties", "associations", "archived"],
  },

  // Stripe
  {
    id: "stripe_charges_list",
    integrationId: "stripe",
    resource: "charges",
    allowedOperations: ["read", "filter"],
    supportedFields: ["limit", "created", "customer"],
  },
  {
    id: "stripe_customers_list",
    integrationId: "stripe",
    resource: "customers",
    allowedOperations: ["read", "filter"],
    supportedFields: ["limit", "email"],
  },
  {
    id: "stripe_subscriptions_list",
    integrationId: "stripe",
    resource: "subscriptions",
    allowedOperations: ["read", "filter"],
    supportedFields: ["limit", "status", "price"],
  },

  // Intercom
  {
    id: "intercom_conversations_list",
    integrationId: "intercom",
    resource: "conversations",
    allowedOperations: ["read", "filter"],
    supportedFields: ["per_page", "page", "type"],
  },
  {
    id: "intercom_contacts_list",
    integrationId: "intercom",
    resource: "contacts",
    allowedOperations: ["read", "filter"],
    supportedFields: ["per_page", "page", "role"],
  },

  // Airtable
  {
    id: "airtable_records_list",
    integrationId: "airtable",
    resource: "records",
    allowedOperations: ["read", "filter"],
    supportedFields: ["baseId", "tableId", "view", "maxRecords"],
    constraints: { requiredFilters: ["baseId", "tableId"] },
  },

  // Asana
  {
    id: "asana_tasks_list",
    integrationId: "asana",
    resource: "tasks",
    allowedOperations: ["read", "filter"],
    supportedFields: ["project", "section", "completed_since"],
  },

  // ClickUp
  {
    id: "clickup_tasks_list",
    integrationId: "clickup",
    resource: "tasks",
    allowedOperations: ["read", "filter"],
    supportedFields: ["list_id", "archived", "page", "order_by"],
    constraints: { requiredFilters: ["list_id"] },
  },

  // Salesforce (Dynamic)
  {
    id: "salesforce_query",
    integrationId: "salesforce",
    resource: "query",
    allowedOperations: ["read", "filter"],
    supportedFields: ["q"],
    constraints: { requiredFilters: ["q"] },
  },

  // Jira (Dynamic)
  {
    id: "jira_issues_search",
    integrationId: "jira",
    resource: "issues",
    allowedOperations: ["read", "filter"],
    supportedFields: ["jql", "startAt", "maxResults", "fields"],
    constraints: { requiredFilters: ["jql"] },
  },

  // Zendesk
  {
    id: "zendesk_tickets_list",
    integrationId: "zendesk",
    resource: "tickets",
    allowedOperations: ["read", "filter"],
    supportedFields: ["per_page", "page", "sort_by", "sort_order"],
  },

  // QuickBooks
  {
    id: "quickbooks_invoices_query",
    integrationId: "quickbooks",
    resource: "invoices",
    allowedOperations: ["read", "filter"],
    supportedFields: ["query"],
    constraints: { requiredFilters: ["query"] },
  },

  // Microsoft Graph (Outlook/Teams)
  {
    id: "outlook_messages_list",
    integrationId: "outlook",
    resource: "messages",
    allowedOperations: ["read", "filter"],
    supportedFields: ["$top", "$skip", "$filter", "$select"],
  },
  {
    id: "teams_messages_list",
    integrationId: "microsoft_teams",
    resource: "messages",
    allowedOperations: ["read"],
    supportedFields: ["teamId", "channelId"],
    constraints: { requiredFilters: ["teamId", "channelId"] },
  },

  // GitLab / Bitbucket
  {
    id: "gitlab_projects_list",
    integrationId: "gitlab",
    resource: "projects",
    allowedOperations: ["read", "filter"],
    supportedFields: ["membership", "simple", "order_by"],
  },
  {
    id: "bitbucket_repos_list",
    integrationId: "bitbucket",
    resource: "repos",
    allowedOperations: ["read"],
    supportedFields: ["workspace"],
    constraints: { requiredFilters: ["workspace"] },
  },

  // Google Analytics
  {
    id: "google_analytics_reports_run",
    integrationId: "google_analytics",
    resource: "reports",
    allowedOperations: ["read", "filter"],
    supportedFields: ["propertyId", "dateRanges", "dimensions", "metrics"],
    constraints: { requiredFilters: ["propertyId", "dateRanges"] },
  },

  // Discord
  {
    id: "discord_channels_list",
    integrationId: "discord",
    resource: "channels",
    allowedOperations: ["read"],
    supportedFields: ["guild_id"],
    constraints: { requiredFilters: ["guild_id"] },
  },
  {
    id: "discord_messages_list",
    integrationId: "discord",
    resource: "messages",
    allowedOperations: ["read"],
    supportedFields: ["channel_id", "limit"],
    constraints: { requiredFilters: ["channel_id"] },
  },

  // Zoom
  {
    id: "zoom_meetings_list",
    integrationId: "zoom",
    resource: "meetings",
    allowedOperations: ["read", "filter"],
    supportedFields: ["userId", "type", "from", "to"],
    constraints: { requiredFilters: ["userId"] },
  },

  // Trello
  {
    id: "trello_boards_list",
    integrationId: "trello",
    resource: "boards",
    allowedOperations: ["read"],
    supportedFields: ["memberId", "filter"],
    constraints: { requiredFilters: ["memberId"] },
  },
  {
    id: "trello_cards_list",
    integrationId: "trello",
    resource: "cards",
    allowedOperations: ["read", "filter"],
    supportedFields: ["boardId", "limit"],
    constraints: { requiredFilters: ["boardId"] },
  },
];
