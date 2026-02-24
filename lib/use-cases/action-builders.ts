import type { ActionSpec } from "@/lib/toolos/spec";

// ─────────────────────────────────────────────────────────────────────────────
// GITHUB
// ─────────────────────────────────────────────────────────────────────────────

export const makeGithubPRListAction = (): ActionSpec => ({
  id: "github.pr.list",
  name: "Search pull requests",
  description: "Search GitHub pull requests",
  type: "READ",
  integrationId: "github",
  capabilityId: "github_pull_requests_search",
  inputSchema: { q: "is:pr is:open", sort: "updated", order: "desc", per_page: 50 },
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

export const makeGithubIssueListAction = (): ActionSpec => ({
  id: "github.issue.list",
  name: "Search issues",
  description: "Search GitHub issues",
  type: "READ",
  integrationId: "github",
  capabilityId: "github_issues_search",
  inputSchema: { q: "is:issue is:open", sort: "updated", order: "desc", per_page: 50 },
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

export const makeGithubRepoListAction = (): ActionSpec => ({
  id: "github.repos.list",
  name: "List repositories",
  description: "List GitHub repositories for the authenticated user",
  type: "READ",
  integrationId: "github",
  capabilityId: "github_repos_list",
  inputSchema: { type: "all", sort: "updated" },
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

export const makeGithubCommitsListAction = (): ActionSpec => ({
  id: "github.commits.list",
  name: "List commits",
  description: "List commits for a repository",
  type: "READ",
  integrationId: "github",
  capabilityId: "github_commits_list",
  inputSchema: {},
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

export const makeGithubCommitStatusAction = (): ActionSpec => ({
  id: "github.commit_status.list",
  name: "Get commit status",
  description: "Get combined status for a commit reference",
  type: "READ",
  integrationId: "github",
  capabilityId: "github_commit_status_list",
  inputSchema: {},
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "medium",
});

export const makeGithubPRReviewsAction = (): ActionSpec => ({
  id: "github.pr.reviews.list",
  name: "List PR reviews",
  description: "List reviews for a pull request",
  type: "READ",
  integrationId: "github",
  capabilityId: "github_pull_request_reviews_list",
  inputSchema: {},
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "medium",
});

// ─────────────────────────────────────────────────────────────────────────────
// LINEAR
// ─────────────────────────────────────────────────────────────────────────────

export const makeLinearIssuesListAction = (): ActionSpec => ({
  id: "linear.issues.list",
  name: "List Linear issues",
  description: "Fetch Linear issues with filters",
  type: "READ",
  integrationId: "linear",
  capabilityId: "linear_issues_list",
  inputSchema: {},
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

export const makeLinearProjectsListAction = (): ActionSpec => ({
  id: "linear.projects.list",
  name: "List Linear projects",
  description: "Fetch all active Linear projects",
  type: "READ",
  integrationId: "linear",
  capabilityId: "linear_projects_list",
  inputSchema: {},
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

export const makeLinearCyclesListAction = (): ActionSpec => ({
  id: "linear.cycles.list",
  name: "List Linear cycles",
  description: "Fetch Linear sprint cycles",
  type: "READ",
  integrationId: "linear",
  capabilityId: "linear_cycles_list",
  inputSchema: {},
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

export const makeLinearTeamsListAction = (): ActionSpec => ({
  id: "linear.teams.list",
  name: "List Linear teams",
  description: "Fetch all Linear teams",
  type: "READ",
  integrationId: "linear",
  capabilityId: "linear_teams_list",
  inputSchema: {},
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

// ─────────────────────────────────────────────────────────────────────────────
// INTERCOM
// ─────────────────────────────────────────────────────────────────────────────

export const makeIntercomConversationsListAction = (): ActionSpec => ({
  id: "intercom.conversations.list",
  name: "List conversations",
  description: "Fetch Intercom conversations",
  type: "READ",
  integrationId: "intercom",
  capabilityId: "intercom_conversations_list",
  inputSchema: { per_page: 50 },
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

export const makeIntercomSearchConversationsAction = (): ActionSpec => ({
  id: "intercom.conversations.search",
  name: "Search conversations",
  description: "Search Intercom conversations by priority and state",
  type: "READ",
  integrationId: "intercom",
  capabilityId: "intercom_search_conversations",
  inputSchema: {},
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

export const makeIntercomCompaniesListAction = (): ActionSpec => ({
  id: "intercom.companies.list",
  name: "List companies",
  description: "Fetch all Intercom companies",
  type: "READ",
  integrationId: "intercom",
  capabilityId: "intercom_companies_list",
  inputSchema: {},
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

// ─────────────────────────────────────────────────────────────────────────────
// HUBSPOT
// ─────────────────────────────────────────────────────────────────────────────

export const makeHubspotDealsListAction = (): ActionSpec => ({
  id: "hubspot.deals.list",
  name: "List HubSpot deals",
  description: "Fetch all HubSpot pipeline deals",
  type: "READ",
  integrationId: "hubspot",
  capabilityId: "hubspot_deals_list",
  inputSchema: {},
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

export const makeHubspotContactsListAction = (): ActionSpec => ({
  id: "hubspot.contacts.list",
  name: "List HubSpot contacts",
  description: "Fetch all HubSpot contacts",
  type: "READ",
  integrationId: "hubspot",
  capabilityId: "hubspot_contacts_list",
  inputSchema: {},
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

export const makeHubspotCompaniesListAction = (): ActionSpec => ({
  id: "hubspot.companies.list",
  name: "List HubSpot companies",
  description: "Fetch all HubSpot companies",
  type: "READ",
  integrationId: "hubspot",
  capabilityId: "hubspot_companies_list",
  inputSchema: {},
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

export const makeHubspotTicketsListAction = (): ActionSpec => ({
  id: "hubspot.tickets.list",
  name: "List HubSpot tickets",
  description: "Fetch all HubSpot support tickets",
  type: "READ",
  integrationId: "hubspot",
  capabilityId: "hubspot_tickets_list",
  inputSchema: {},
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

// ─────────────────────────────────────────────────────────────────────────────
// STRIPE
// ─────────────────────────────────────────────────────────────────────────────

export const makeStripeChargesListAction = (): ActionSpec => ({
  id: "stripe.charges.list",
  name: "List Stripe charges",
  description: "Fetch all Stripe payment charges",
  type: "READ",
  integrationId: "stripe",
  capabilityId: "stripe_charges_list",
  inputSchema: { limit: 50 },
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

export const makeStripeSubscriptionsListAction = (): ActionSpec => ({
  id: "stripe.subscriptions.list",
  name: "List subscriptions",
  description: "Fetch all Stripe subscriptions",
  type: "READ",
  integrationId: "stripe",
  capabilityId: "stripe_subscriptions_list",
  inputSchema: { limit: 50 },
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

export const makeStripeCustomersListAction = (): ActionSpec => ({
  id: "stripe.customers.list",
  name: "List customers",
  description: "Fetch all Stripe customers",
  type: "READ",
  integrationId: "stripe",
  capabilityId: "stripe_customers_list",
  inputSchema: { limit: 50 },
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

export const makeStripeInvoicesListAction = (): ActionSpec => ({
  id: "stripe.invoices.list",
  name: "List invoices",
  description: "Fetch all Stripe invoices",
  type: "READ",
  integrationId: "stripe",
  capabilityId: "stripe_invoices_list",
  inputSchema: { limit: 50 },
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

// ─────────────────────────────────────────────────────────────────────────────
// NOTION
// ─────────────────────────────────────────────────────────────────────────────

export const makeNotionPagesSearchAction = (): ActionSpec => ({
  id: "notion.pages.search",
  name: "Search Notion pages",
  description: "Search all Notion pages and databases",
  type: "READ",
  integrationId: "notion",
  capabilityId: "notion_pages_search",
  inputSchema: {},
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

export const makeNotionDatabasesQueryAction = (): ActionSpec => ({
  id: "notion.databases.query",
  name: "Query Notion database",
  description: "Query records from a Notion database",
  type: "READ",
  integrationId: "notion",
  capabilityId: "notion_databases_query",
  inputSchema: {},
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

// ─────────────────────────────────────────────────────────────────────────────
// TRELLO
// ─────────────────────────────────────────────────────────────────────────────

export const makeTrelloBoardsListAction = (): ActionSpec => ({
  id: "trello.boards.list",
  name: "List Trello boards",
  description: "Fetch all Trello boards",
  type: "READ",
  integrationId: "trello",
  capabilityId: "trello_boards_list",
  inputSchema: { idMember: "me" },
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

export const makeTrelloCardsListAction = (): ActionSpec => ({
  id: "trello.cards.list",
  name: "List Trello cards",
  description: "Fetch cards from a Trello board",
  type: "READ",
  integrationId: "trello",
  capabilityId: "trello_cards_list",
  inputSchema: {},
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

// ─────────────────────────────────────────────────────────────────────────────
// ASANA
// ─────────────────────────────────────────────────────────────────────────────

export const makeAsanaTasksListAction = (): ActionSpec => ({
  id: "asana.tasks.list",
  name: "List Asana tasks",
  description: "Fetch tasks from Asana",
  type: "READ",
  integrationId: "asana",
  capabilityId: "asana_tasks_list",
  inputSchema: {},
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

export const makeAsanaProjectsListAction = (): ActionSpec => ({
  id: "asana.projects.list",
  name: "List Asana projects",
  description: "Fetch all Asana projects",
  type: "READ",
  integrationId: "asana",
  capabilityId: "asana_workspace_projects_list",
  inputSchema: {},
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

// ─────────────────────────────────────────────────────────────────────────────
// OUTLOOK
// ─────────────────────────────────────────────────────────────────────────────

export const makeOutlookMessagesListAction = (): ActionSpec => ({
  id: "outlook.messages.list",
  name: "List email messages",
  description: "Fetch Outlook email messages",
  type: "READ",
  integrationId: "outlook",
  capabilityId: "outlook_messages_list",
  inputSchema: {},
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

export const makeOutlookEventsListAction = (): ActionSpec => ({
  id: "outlook.events.list",
  name: "List calendar events",
  description: "Fetch Outlook calendar events",
  type: "READ",
  integrationId: "outlook",
  capabilityId: "outlook_events_list",
  inputSchema: {},
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

export const makeOutlookContactsListAction = (): ActionSpec => ({
  id: "outlook.contacts.list",
  name: "List contacts",
  description: "Fetch Outlook contacts",
  type: "READ",
  integrationId: "outlook",
  capabilityId: "outlook_contacts_list",
  inputSchema: {},
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

// ─────────────────────────────────────────────────────────────────────────────
// ZOOM
// ─────────────────────────────────────────────────────────────────────────────

export const makeZoomMeetingsListAction = (): ActionSpec => ({
  id: "zoom.meetings.list",
  name: "List Zoom meetings",
  description: "Fetch Zoom meetings",
  type: "READ",
  integrationId: "zoom",
  capabilityId: "zoom_meetings_list",
  inputSchema: { userId: "me", type: "upcoming" },
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

// ─────────────────────────────────────────────────────────────────────────────
// GITLAB
// ─────────────────────────────────────────────────────────────────────────────

export const makeGitlabMRListAction = (): ActionSpec => ({
  id: "gitlab.mr.list",
  name: "List merge requests",
  description: "Fetch GitLab merge requests",
  type: "READ",
  integrationId: "gitlab",
  capabilityId: "gitlab_merge_requests_list",
  inputSchema: {},
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

export const makeGitlabPipelinesListAction = (): ActionSpec => ({
  id: "gitlab.pipelines.list",
  name: "List pipelines",
  description: "Fetch GitLab CI/CD pipelines",
  type: "READ",
  integrationId: "gitlab",
  capabilityId: "gitlab_pipelines_list",
  inputSchema: {},
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

// ─────────────────────────────────────────────────────────────────────────────
// BITBUCKET
// ─────────────────────────────────────────────────────────────────────────────

export const makeBitbucketPRListAction = (): ActionSpec => ({
  id: "bitbucket.pr.list",
  name: "List pull requests",
  description: "Fetch Bitbucket pull requests",
  type: "READ",
  integrationId: "bitbucket",
  capabilityId: "bitbucket_pull_requests_list",
  inputSchema: {},
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

// ─────────────────────────────────────────────────────────────────────────────
// MICROSOFT TEAMS
// ─────────────────────────────────────────────────────────────────────────────

export const makeTeamsMessagesListAction = (): ActionSpec => ({
  id: "teams.messages.list",
  name: "List Teams messages",
  description: "Fetch Microsoft Teams messages",
  type: "READ",
  integrationId: "microsoft_teams",
  capabilityId: "teams_messages_list",
  inputSchema: {},
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

// ─────────────────────────────────────────────────────────────────────────────
// SLACK
// ─────────────────────────────────────────────────────────────────────────────

export const makeSlackChannelsListAction = (): ActionSpec => ({
  id: "slack.channels.list",
  name: "List Slack channels",
  description: "List all Slack channels",
  type: "READ",
  integrationId: "slack",
  capabilityId: "slack_channels_list",
  inputSchema: {},
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

export const makeSlackMessagesListAction = (): ActionSpec => ({
  id: "slack.messages.list",
  name: "List Slack messages",
  description: "Fetch Slack channel conversation history",
  type: "READ",
  integrationId: "slack",
  capabilityId: "slack_messages_list",
  inputSchema: {},
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

// ─────────────────────────────────────────────────────────────────────────────
// AIRTABLE
// ─────────────────────────────────────────────────────────────────────────────

export const makeAirtableRecordsListAction = (): ActionSpec => ({
  id: "airtable.records.list",
  name: "List Airtable records",
  description: "Fetch records from an Airtable table",
  type: "READ",
  integrationId: "airtable",
  capabilityId: "airtable_records_list",
  inputSchema: {},
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

export const makeAirtableBasesListAction = (): ActionSpec => ({
  id: "airtable.bases.list",
  name: "List Airtable bases",
  description: "Fetch all accessible Airtable bases",
  type: "READ",
  integrationId: "airtable",
  capabilityId: "airtable_bases_list",
  inputSchema: {},
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

// ─────────────────────────────────────────────────────────────────────────────
// QUICKBOOKS
// ─────────────────────────────────────────────────────────────────────────────

export const makeQBAccountsQueryAction = (): ActionSpec => ({
  id: "quickbooks.accounts.query",
  name: "Query accounts",
  description: "Query QuickBooks chart of accounts",
  type: "READ",
  integrationId: "quickbooks",
  capabilityId: "quickbooks_accounts_query",
  inputSchema: {},
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

export const makeQBBalanceReportAction = (): ActionSpec => ({
  id: "quickbooks.balance.report",
  name: "Balance report",
  description: "Get QuickBooks customer balance report",
  type: "READ",
  integrationId: "quickbooks",
  capabilityId: "quickbooks_balance_report",
  inputSchema: {},
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

export const makeQBVendorsReadAction = (): ActionSpec => ({
  id: "quickbooks.vendors.read",
  name: "Read vendors",
  description: "Read QuickBooks vendor information",
  type: "READ",
  integrationId: "quickbooks",
  capabilityId: "quickbooks_vendors_read",
  inputSchema: {},
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

// ─────────────────────────────────────────────────────────────────────────────
// JIRA
// ─────────────────────────────────────────────────────────────────────────────

export const makeJiraIssuesSearchAction = (): ActionSpec => ({
  id: "jira.issues.search",
  name: "Search Jira issues",
  description: "Search Jira issues using JQL",
  type: "READ",
  integrationId: "jira",
  capabilityId: "jira_issues_search",
  inputSchema: { jql: "status != Done ORDER BY updated DESC" },
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

// ─────────────────────────────────────────────────────────────────────────────
// ZENDESK
// ─────────────────────────────────────────────────────────────────────────────

export const makeZendeskTicketsListAction = (): ActionSpec => ({
  id: "zendesk.tickets.list",
  name: "List Zendesk tickets",
  description: "Fetch Zendesk support tickets",
  type: "READ",
  integrationId: "zendesk",
  capabilityId: "zendesk_tickets_list",
  inputSchema: {},
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────

export const makeGAAccountsListAction = (): ActionSpec => ({
  id: "google_analytics.accounts.list",
  name: "List GA accounts",
  description: "List Google Analytics accounts",
  type: "READ",
  integrationId: "google_analytics",
  capabilityId: "google_analytics_accounts_list",
  inputSchema: {},
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});

export const makeGAAudiencesListAction = (): ActionSpec => ({
  id: "google_analytics.audiences.list",
  name: "List GA audiences",
  description: "List Google Analytics audiences",
  type: "READ",
  integrationId: "google_analytics",
  capabilityId: "google_analytics_audiences_list",
  inputSchema: {},
  outputSchema: {},
  writesToState: false,
  confidenceLevel: "high",
});
