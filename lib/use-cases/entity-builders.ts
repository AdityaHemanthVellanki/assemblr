import type { EntitySpec } from "@/lib/toolos/spec";

// ─────────────────────────────────────────────────────────────────────────────
// GITHUB
// ─────────────────────────────────────────────────────────────────────────────

export const makeGithubPREntity = (): EntitySpec => ({
  name: "PullRequest",
  sourceIntegration: "github",
  identifiers: ["id", "number"],
  supportedActions: ["github.pr.list"],
  confidenceLevel: "high",
  fields: [
    { name: "title", type: "string", required: true },
    { name: "number", type: "number", required: true },
    { name: "state", type: "string", required: true },
    { name: "author", type: "string" },
    { name: "assignees", type: "string" },
    { name: "created_at", type: "datetime" },
    { name: "updated_at", type: "datetime" },
    { name: "merged_at", type: "datetime" },
    { name: "head", type: "string" },
    { name: "base", type: "string" },
    { name: "draft", type: "boolean" },
    { name: "review_comments", type: "number" },
    { name: "changed_files", type: "number" },
    { name: "additions", type: "number" },
    { name: "deletions", type: "number" },
    { name: "html_url", type: "url" },
  ],
});

export const makeGithubIssueEntity = (): EntitySpec => ({
  name: "Issue",
  sourceIntegration: "github",
  identifiers: ["id", "number"],
  supportedActions: ["github.issue.list"],
  confidenceLevel: "high",
  fields: [
    { name: "title", type: "string", required: true },
    { name: "number", type: "number", required: true },
    { name: "state", type: "string", required: true },
    { name: "labels", type: "string" },
    { name: "assignee", type: "string" },
    { name: "created_at", type: "datetime" },
    { name: "updated_at", type: "datetime" },
    { name: "closed_at", type: "datetime" },
    { name: "comments", type: "number" },
    { name: "body", type: "string" },
    { name: "html_url", type: "url" },
  ],
});

export const makeGithubRepoEntity = (): EntitySpec => ({
  name: "Repository",
  sourceIntegration: "github",
  identifiers: ["id", "full_name"],
  supportedActions: ["github.repos.list"],
  confidenceLevel: "high",
  fields: [
    { name: "name", type: "string", required: true },
    { name: "full_name", type: "string", required: true },
    { name: "description", type: "string" },
    { name: "language", type: "string" },
    { name: "stargazers_count", type: "number" },
    { name: "forks_count", type: "number" },
    { name: "open_issues_count", type: "number" },
    { name: "updated_at", type: "datetime" },
    { name: "pushed_at", type: "datetime" },
    { name: "html_url", type: "url" },
    { name: "visibility", type: "string" },
  ],
});

export const makeGithubCommitEntity = (): EntitySpec => ({
  name: "Commit",
  sourceIntegration: "github",
  identifiers: ["sha"],
  supportedActions: ["github.commits.list"],
  confidenceLevel: "high",
  fields: [
    { name: "sha", type: "string", required: true },
    { name: "message", type: "string", required: true },
    { name: "author", type: "string" },
    { name: "date", type: "datetime" },
    { name: "html_url", type: "url" },
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// LINEAR
// ─────────────────────────────────────────────────────────────────────────────

export const makeLinearIssueEntity = (): EntitySpec => ({
  name: "LinearIssue",
  sourceIntegration: "linear",
  identifiers: ["id"],
  supportedActions: ["linear.issues.list"],
  confidenceLevel: "high",
  fields: [
    { name: "title", type: "string", required: true },
    { name: "identifier", type: "string", required: true },
    { name: "state", type: "string", required: true },
    { name: "priority", type: "number" },
    { name: "assignee", type: "string" },
    { name: "team", type: "string" },
    { name: "project", type: "string" },
    { name: "cycle", type: "string" },
    { name: "labels", type: "string" },
    { name: "estimate", type: "number" },
    { name: "createdAt", type: "datetime" },
    { name: "updatedAt", type: "datetime" },
    { name: "dueDate", type: "datetime" },
    { name: "completedAt", type: "datetime" },
    { name: "url", type: "url" },
  ],
});

export const makeLinearProjectEntity = (): EntitySpec => ({
  name: "LinearProject",
  sourceIntegration: "linear",
  identifiers: ["id"],
  supportedActions: ["linear.projects.list"],
  confidenceLevel: "high",
  fields: [
    { name: "name", type: "string", required: true },
    { name: "state", type: "string", required: true },
    { name: "progress", type: "number" },
    { name: "startDate", type: "datetime" },
    { name: "targetDate", type: "datetime" },
    { name: "lead", type: "string" },
    { name: "memberCount", type: "number" },
    { name: "issueCount", type: "number" },
    { name: "completedIssueCount", type: "number" },
    { name: "url", type: "url" },
  ],
});

export const makeLinearCycleEntity = (): EntitySpec => ({
  name: "LinearCycle",
  sourceIntegration: "linear",
  identifiers: ["id"],
  supportedActions: ["linear.cycles.list"],
  confidenceLevel: "high",
  fields: [
    { name: "name", type: "string", required: true },
    { name: "number", type: "number" },
    { name: "startsAt", type: "datetime" },
    { name: "endsAt", type: "datetime" },
    { name: "completedAt", type: "datetime" },
    { name: "progress", type: "number" },
    { name: "issueCountHistory", type: "number" },
    { name: "scopeHistory", type: "number" },
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// INTERCOM
// ─────────────────────────────────────────────────────────────────────────────

export const makeIntercomConversationEntity = (): EntitySpec => ({
  name: "Conversation",
  sourceIntegration: "intercom",
  identifiers: ["id"],
  supportedActions: ["intercom.conversations.list"],
  confidenceLevel: "high",
  fields: [
    { name: "id", type: "string", required: true },
    { name: "state", type: "string", required: true },
    { name: "subject", type: "string" },
    { name: "contact_name", type: "string" },
    { name: "assignee", type: "string" },
    { name: "priority", type: "string" },
    { name: "created_at", type: "datetime" },
    { name: "updated_at", type: "datetime" },
    { name: "waiting_since", type: "datetime" },
    { name: "open", type: "boolean" },
    { name: "read", type: "boolean" },
  ],
});

export const makeIntercomCompanyEntity = (): EntitySpec => ({
  name: "IntercomCompany",
  sourceIntegration: "intercom",
  identifiers: ["id"],
  supportedActions: ["intercom.companies.list"],
  confidenceLevel: "high",
  fields: [
    { name: "name", type: "string", required: true },
    { name: "company_id", type: "string" },
    { name: "plan", type: "string" },
    { name: "monthly_spend", type: "number" },
    { name: "user_count", type: "number" },
    { name: "session_count", type: "number" },
    { name: "created_at", type: "datetime" },
    { name: "last_request_at", type: "datetime" },
    { name: "industry", type: "string" },
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// HUBSPOT
// ─────────────────────────────────────────────────────────────────────────────

export const makeHubspotDealEntity = (): EntitySpec => ({
  name: "Deal",
  sourceIntegration: "hubspot",
  identifiers: ["id"],
  supportedActions: ["hubspot.deals.list"],
  confidenceLevel: "high",
  fields: [
    { name: "dealname", type: "string", required: true },
    { name: "dealstage", type: "string", required: true },
    { name: "amount", type: "number" },
    { name: "closedate", type: "datetime" },
    { name: "pipeline", type: "string" },
    { name: "hubspot_owner_id", type: "string" },
    { name: "createdate", type: "datetime" },
    { name: "hs_lastmodifieddate", type: "datetime" },
    { name: "hs_deal_stage_probability", type: "number" },
    { name: "num_associated_contacts", type: "number" },
  ],
});

export const makeHubspotContactEntity = (): EntitySpec => ({
  name: "HubspotContact",
  sourceIntegration: "hubspot",
  identifiers: ["id"],
  supportedActions: ["hubspot.contacts.list"],
  confidenceLevel: "high",
  fields: [
    { name: "firstname", type: "string", required: true },
    { name: "lastname", type: "string" },
    { name: "email", type: "string" },
    { name: "phone", type: "string" },
    { name: "company", type: "string" },
    { name: "jobtitle", type: "string" },
    { name: "lifecyclestage", type: "string" },
    { name: "hs_lead_status", type: "string" },
    { name: "createdate", type: "datetime" },
    { name: "lastmodifieddate", type: "datetime" },
  ],
});

export const makeHubspotCompanyEntity = (): EntitySpec => ({
  name: "HubspotCompany",
  sourceIntegration: "hubspot",
  identifiers: ["id"],
  supportedActions: ["hubspot.companies.list"],
  confidenceLevel: "high",
  fields: [
    { name: "name", type: "string", required: true },
    { name: "domain", type: "string" },
    { name: "industry", type: "string" },
    { name: "numberofemployees", type: "number" },
    { name: "annualrevenue", type: "number" },
    { name: "lifecyclestage", type: "string" },
    { name: "city", type: "string" },
    { name: "country", type: "string" },
    { name: "createdate", type: "datetime" },
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// STRIPE
// ─────────────────────────────────────────────────────────────────────────────

export const makeStripeSubscriptionEntity = (): EntitySpec => ({
  name: "Subscription",
  sourceIntegration: "stripe",
  identifiers: ["id"],
  supportedActions: ["stripe.subscriptions.list"],
  confidenceLevel: "high",
  fields: [
    { name: "id", type: "string", required: true },
    { name: "status", type: "string", required: true },
    { name: "customer", type: "string", required: true },
    { name: "current_period_start", type: "datetime" },
    { name: "current_period_end", type: "datetime" },
    { name: "cancel_at_period_end", type: "boolean" },
    { name: "plan_amount", type: "number" },
    { name: "plan_currency", type: "string" },
    { name: "plan_interval", type: "string" },
    { name: "trial_end", type: "datetime" },
  ],
});

export const makeStripeChargeEntity = (): EntitySpec => ({
  name: "Charge",
  sourceIntegration: "stripe",
  identifiers: ["id"],
  supportedActions: ["stripe.charges.list"],
  confidenceLevel: "high",
  fields: [
    { name: "id", type: "string", required: true },
    { name: "amount", type: "number", required: true },
    { name: "currency", type: "string", required: true },
    { name: "status", type: "string", required: true },
    { name: "description", type: "string" },
    { name: "customer", type: "string" },
    { name: "receipt_email", type: "string" },
    { name: "created", type: "datetime" },
    { name: "failure_message", type: "string" },
    { name: "refunded", type: "boolean" },
  ],
});

export const makeStripeInvoiceEntity = (): EntitySpec => ({
  name: "Invoice",
  sourceIntegration: "stripe",
  identifiers: ["id"],
  supportedActions: ["stripe.invoices.list"],
  confidenceLevel: "high",
  fields: [
    { name: "id", type: "string", required: true },
    { name: "status", type: "string", required: true },
    { name: "customer_email", type: "string" },
    { name: "amount_due", type: "number" },
    { name: "amount_paid", type: "number" },
    { name: "amount_remaining", type: "number" },
    { name: "currency", type: "string" },
    { name: "due_date", type: "datetime" },
    { name: "created", type: "datetime" },
    { name: "paid_at", type: "datetime" },
    { name: "hosted_invoice_url", type: "url" },
  ],
});

export const makeStripeCustomerEntity = (): EntitySpec => ({
  name: "StripeCustomer",
  sourceIntegration: "stripe",
  identifiers: ["id"],
  supportedActions: ["stripe.customers.list"],
  confidenceLevel: "high",
  fields: [
    { name: "id", type: "string", required: true },
    { name: "name", type: "string" },
    { name: "email", type: "string" },
    { name: "phone", type: "string" },
    { name: "currency", type: "string" },
    { name: "balance", type: "number" },
    { name: "created", type: "datetime" },
    { name: "delinquent", type: "boolean" },
    { name: "description", type: "string" },
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// NOTION
// ─────────────────────────────────────────────────────────────────────────────

export const makeNotionPageEntity = (): EntitySpec => ({
  name: "NotionPage",
  sourceIntegration: "notion",
  identifiers: ["id"],
  supportedActions: ["notion.pages.search"],
  confidenceLevel: "high",
  fields: [
    { name: "title", type: "string", required: true },
    { name: "url", type: "url" },
    { name: "last_edited_time", type: "datetime" },
    { name: "created_time", type: "datetime" },
    { name: "created_by", type: "string" },
    { name: "last_edited_by", type: "string" },
    { name: "archived", type: "boolean" },
    { name: "parent", type: "string" },
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// TRELLO
// ─────────────────────────────────────────────────────────────────────────────

export const makeTrelloBoardEntity = (): EntitySpec => ({
  name: "TrelloBoard",
  sourceIntegration: "trello",
  identifiers: ["id"],
  supportedActions: ["trello.boards.list"],
  confidenceLevel: "high",
  fields: [
    { name: "name", type: "string", required: true },
    { name: "desc", type: "string" },
    { name: "url", type: "url" },
    { name: "dateLastActivity", type: "datetime" },
    { name: "closed", type: "boolean" },
  ],
});

export const makeTrelloCardEntity = (): EntitySpec => ({
  name: "TrelloCard",
  sourceIntegration: "trello",
  identifiers: ["id"],
  supportedActions: ["trello.cards.list"],
  confidenceLevel: "high",
  fields: [
    { name: "name", type: "string", required: true },
    { name: "desc", type: "string" },
    { name: "due", type: "datetime" },
    { name: "dueComplete", type: "boolean" },
    { name: "idList", type: "string" },
    { name: "labels", type: "string" },
    { name: "members", type: "string" },
    { name: "dateLastActivity", type: "datetime" },
    { name: "closed", type: "boolean" },
    { name: "url", type: "url" },
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// ASANA
// ─────────────────────────────────────────────────────────────────────────────

export const makeAsanaTaskEntity = (): EntitySpec => ({
  name: "AsanaTask",
  sourceIntegration: "asana",
  identifiers: ["gid"],
  supportedActions: ["asana.tasks.list"],
  confidenceLevel: "high",
  fields: [
    { name: "name", type: "string", required: true },
    { name: "completed", type: "boolean", required: true },
    { name: "assignee", type: "string" },
    { name: "due_on", type: "datetime" },
    { name: "projects", type: "string" },
    { name: "tags", type: "string" },
    { name: "notes", type: "string" },
    { name: "created_at", type: "datetime" },
    { name: "modified_at", type: "datetime" },
  ],
});

export const makeAsanaProjectEntity = (): EntitySpec => ({
  name: "AsanaProject",
  sourceIntegration: "asana",
  identifiers: ["gid"],
  supportedActions: ["asana.projects.list"],
  confidenceLevel: "high",
  fields: [
    { name: "name", type: "string", required: true },
    { name: "owner", type: "string" },
    { name: "due_date", type: "datetime" },
    { name: "start_on", type: "datetime" },
    { name: "status", type: "string" },
    { name: "archived", type: "boolean" },
    { name: "created_at", type: "datetime" },
    { name: "modified_at", type: "datetime" },
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// OUTLOOK
// ─────────────────────────────────────────────────────────────────────────────

export const makeOutlookEmailEntity = (): EntitySpec => ({
  name: "Email",
  sourceIntegration: "outlook",
  identifiers: ["id"],
  supportedActions: ["outlook.messages.list"],
  confidenceLevel: "high",
  fields: [
    { name: "subject", type: "string", required: true },
    { name: "from", type: "string", required: true },
    { name: "toRecipients", type: "string" },
    { name: "receivedDateTime", type: "datetime" },
    { name: "isRead", type: "boolean" },
    { name: "importance", type: "string" },
    { name: "bodyPreview", type: "string" },
    { name: "hasAttachments", type: "boolean" },
  ],
});

export const makeOutlookEventEntity = (): EntitySpec => ({
  name: "OutlookEvent",
  sourceIntegration: "outlook",
  identifiers: ["id"],
  supportedActions: ["outlook.events.list"],
  confidenceLevel: "high",
  fields: [
    { name: "subject", type: "string", required: true },
    { name: "organizer", type: "string", required: true },
    { name: "start", type: "datetime" },
    { name: "end", type: "datetime" },
    { name: "location", type: "string" },
    { name: "attendees", type: "string" },
    { name: "isOnlineMeeting", type: "boolean" },
    { name: "isAllDay", type: "boolean" },
    { name: "bodyPreview", type: "string" },
  ],
});

export const makeOutlookContactEntity = (): EntitySpec => ({
  name: "OutlookContact",
  sourceIntegration: "outlook",
  identifiers: ["id"],
  supportedActions: ["outlook.contacts.list"],
  confidenceLevel: "high",
  fields: [
    { name: "displayName", type: "string", required: true },
    { name: "emailAddresses", type: "string" },
    { name: "businessPhones", type: "string" },
    { name: "companyName", type: "string" },
    { name: "jobTitle", type: "string" },
    { name: "department", type: "string" },
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// ZOOM
// ─────────────────────────────────────────────────────────────────────────────

export const makeZoomMeetingEntity = (): EntitySpec => ({
  name: "Meeting",
  sourceIntegration: "zoom",
  identifiers: ["id"],
  supportedActions: ["zoom.meetings.list"],
  confidenceLevel: "high",
  fields: [
    { name: "topic", type: "string", required: true },
    { name: "type", type: "number" },
    { name: "start_time", type: "datetime" },
    { name: "duration", type: "number" },
    { name: "host_id", type: "string" },
    { name: "join_url", type: "url" },
    { name: "status", type: "string" },
    { name: "agenda", type: "string" },
    { name: "created_at", type: "datetime" },
    { name: "timezone", type: "string" },
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// GITLAB
// ─────────────────────────────────────────────────────────────────────────────

export const makeGitlabMREntity = (): EntitySpec => ({
  name: "MergeRequest",
  sourceIntegration: "gitlab",
  identifiers: ["id", "iid"],
  supportedActions: ["gitlab.mr.list"],
  confidenceLevel: "high",
  fields: [
    { name: "title", type: "string", required: true },
    { name: "state", type: "string", required: true },
    { name: "author", type: "string" },
    { name: "assignee", type: "string" },
    { name: "source_branch", type: "string" },
    { name: "target_branch", type: "string" },
    { name: "created_at", type: "datetime" },
    { name: "updated_at", type: "datetime" },
    { name: "merged_at", type: "datetime" },
    { name: "web_url", type: "url" },
    { name: "pipeline_status", type: "string" },
  ],
});

export const makeGitlabPipelineEntity = (): EntitySpec => ({
  name: "Pipeline",
  sourceIntegration: "gitlab",
  identifiers: ["id"],
  supportedActions: ["gitlab.pipelines.list"],
  confidenceLevel: "high",
  fields: [
    { name: "id", type: "number", required: true },
    { name: "status", type: "string", required: true },
    { name: "ref", type: "string" },
    { name: "sha", type: "string" },
    { name: "created_at", type: "datetime" },
    { name: "updated_at", type: "datetime" },
    { name: "duration", type: "number" },
    { name: "web_url", type: "url" },
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// BITBUCKET
// ─────────────────────────────────────────────────────────────────────────────

export const makeBitbucketPREntity = (): EntitySpec => ({
  name: "BitbucketPR",
  sourceIntegration: "bitbucket",
  identifiers: ["id"],
  supportedActions: ["bitbucket.pr.list"],
  confidenceLevel: "high",
  fields: [
    { name: "title", type: "string", required: true },
    { name: "state", type: "string", required: true },
    { name: "author", type: "string" },
    { name: "source", type: "string" },
    { name: "destination", type: "string" },
    { name: "created_on", type: "datetime" },
    { name: "updated_on", type: "datetime" },
    { name: "description", type: "string" },
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// MICROSOFT TEAMS
// ─────────────────────────────────────────────────────────────────────────────

export const makeTeamsMessageEntity = (): EntitySpec => ({
  name: "TeamsMessage",
  sourceIntegration: "microsoft_teams",
  identifiers: ["id"],
  supportedActions: ["teams.messages.list"],
  confidenceLevel: "high",
  fields: [
    { name: "body", type: "string", required: true },
    { name: "from", type: "string" },
    { name: "createdDateTime", type: "datetime" },
    { name: "lastModifiedDateTime", type: "datetime" },
    { name: "messageType", type: "string" },
    { name: "importance", type: "string" },
    { name: "webUrl", type: "url" },
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// SLACK
// ─────────────────────────────────────────────────────────────────────────────

export const makeSlackChannelEntity = (): EntitySpec => ({
  name: "SlackChannel",
  sourceIntegration: "slack",
  identifiers: ["id"],
  supportedActions: ["slack.channels.list"],
  confidenceLevel: "high",
  fields: [
    { name: "name", type: "string", required: true },
    { name: "id", type: "string", required: true },
    { name: "is_private", type: "boolean" },
    { name: "is_archived", type: "boolean" },
    { name: "num_members", type: "number" },
    { name: "topic", type: "string" },
    { name: "purpose", type: "string" },
    { name: "created", type: "datetime" },
  ],
});

export const makeSlackMessageEntity = (): EntitySpec => ({
  name: "SlackMessage",
  sourceIntegration: "slack",
  identifiers: ["ts"],
  supportedActions: ["slack.messages.list"],
  confidenceLevel: "high",
  fields: [
    { name: "text", type: "string", required: true },
    { name: "user", type: "string", required: true },
    { name: "ts", type: "string" },
    { name: "channel", type: "string" },
    { name: "type", type: "string" },
    { name: "reply_count", type: "number" },
    { name: "reactions", type: "string" },
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// AIRTABLE
// ─────────────────────────────────────────────────────────────────────────────

export const makeAirtableRecordEntity = (): EntitySpec => ({
  name: "AirtableRecord",
  sourceIntegration: "airtable",
  identifiers: ["id"],
  supportedActions: ["airtable.records.list"],
  confidenceLevel: "high",
  fields: [
    { name: "id", type: "string", required: true },
    { name: "createdTime", type: "datetime" },
    { name: "fields", type: "string" },
  ],
});

export const makeAirtableBaseEntity = (): EntitySpec => ({
  name: "AirtableBase",
  sourceIntegration: "airtable",
  identifiers: ["id"],
  supportedActions: ["airtable.bases.list"],
  confidenceLevel: "high",
  fields: [
    { name: "id", type: "string", required: true },
    { name: "name", type: "string", required: true },
    { name: "permissionLevel", type: "string" },
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// QUICKBOOKS
// ─────────────────────────────────────────────────────────────────────────────

export const makeQBAccountEntity = (): EntitySpec => ({
  name: "QBAccount",
  sourceIntegration: "quickbooks",
  identifiers: ["Id"],
  supportedActions: ["quickbooks.accounts.query"],
  confidenceLevel: "high",
  fields: [
    { name: "Name", type: "string", required: true },
    { name: "AccountType", type: "string" },
    { name: "AccountSubType", type: "string" },
    { name: "CurrentBalance", type: "number" },
    { name: "Active", type: "boolean" },
    { name: "Classification", type: "string" },
    { name: "CurrencyRef", type: "string" },
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// JIRA
// ─────────────────────────────────────────────────────────────────────────────

export const makeJiraIssueEntity = (): EntitySpec => ({
  name: "JiraIssue",
  sourceIntegration: "jira",
  identifiers: ["id", "key"],
  supportedActions: ["jira.issues.search"],
  confidenceLevel: "high",
  fields: [
    { name: "key", type: "string", required: true },
    { name: "summary", type: "string", required: true },
    { name: "status", type: "string", required: true },
    { name: "issuetype", type: "string" },
    { name: "priority", type: "string" },
    { name: "assignee", type: "string" },
    { name: "reporter", type: "string" },
    { name: "project", type: "string" },
    { name: "created", type: "datetime" },
    { name: "updated", type: "datetime" },
    { name: "duedate", type: "datetime" },
    { name: "labels", type: "string" },
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// ZENDESK
// ─────────────────────────────────────────────────────────────────────────────

export const makeZendeskTicketEntity = (): EntitySpec => ({
  name: "ZendeskTicket",
  sourceIntegration: "zendesk",
  identifiers: ["id"],
  supportedActions: ["zendesk.tickets.list"],
  confidenceLevel: "high",
  fields: [
    { name: "subject", type: "string", required: true },
    { name: "status", type: "string", required: true },
    { name: "priority", type: "string" },
    { name: "type", type: "string" },
    { name: "requester", type: "string" },
    { name: "assignee", type: "string" },
    { name: "tags", type: "string" },
    { name: "created_at", type: "datetime" },
    { name: "updated_at", type: "datetime" },
    { name: "due_at", type: "datetime" },
    { name: "satisfaction_rating", type: "string" },
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────

export const makeGAAccountEntity = (): EntitySpec => ({
  name: "GAAccount",
  sourceIntegration: "google_analytics",
  identifiers: ["name"],
  supportedActions: ["google_analytics.accounts.list"],
  confidenceLevel: "high",
  fields: [
    { name: "name", type: "string", required: true },
    { name: "displayName", type: "string" },
    { name: "createTime", type: "datetime" },
    { name: "updateTime", type: "datetime" },
    { name: "deleted", type: "boolean" },
  ],
});
