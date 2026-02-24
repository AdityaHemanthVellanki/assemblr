
import { executeAction, getGitHubUsername } from "@/lib/integrations/composio/execution";
import { getComposioEntityId } from "@/lib/integrations/composio/connection";
import { IntegrationRuntime } from "@/lib/execution/types";
import { resolveComposioActionName } from "@/lib/actionkit/registry";

/**
 * Static capability ID → Composio action name mapping.
 * Used when the compiler falls back to curated capabilities from the static registry
 * instead of synthesized Composio capabilities (which already use the correct format).
 */
const STATIC_TO_COMPOSIO: Record<string, string> = {
    // GitHub — verified against Composio API 2026-02-14
    github_repos_list: "GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER",
    github_repo_get: "GITHUB_GET_A_REPOSITORY",
    github_issues_list: "GITHUB_LIST_REPOSITORY_ISSUES",
    github_issues_search: "GITHUB_SEARCH_ISSUES_AND_PULL_REQUESTS",
    github_commits_list: "GITHUB_LIST_COMMITS",
    github_commit_status_list: "GITHUB_GET_THE_COMBINED_STATUS_FOR_A_SPECIFIC_REFERENCE",
    github_pull_requests_search: "GITHUB_SEARCH_ISSUES_AND_PULL_REQUESTS",
    github_pull_request_get: "GITHUB_GET_A_PULL_REQUEST",
    github_pull_request_reviews_list: "GITHUB_LIST_REVIEWS_FOR_A_PULL_REQUEST",
    github_pull_request_comments_list: "GITHUB_LIST_REVIEW_COMMENTS_ON_A_PULL_REQUEST",
    github_repo_collaborators_list: "GITHUB_LIST_REPOSITORY_COLLABORATORS",
    github_issue_comment: "GITHUB_CREATE_AN_ISSUE_COMMENT",
    github_issue_close: "GITHUB_UPDATE_AN_ISSUE",
    github_issue_assign: "GITHUB_ADD_ASSIGNEES_TO_AN_ISSUE",
    github_issue_create: "GITHUB_CREATE_AN_ISSUE",
    github_issue_update: "GITHUB_UPDATE_AN_ISSUE",
    github_issue_label: "GITHUB_ADD_LABELS_TO_AN_ISSUE",
    github_pr_create: "GITHUB_CREATE_A_PULL_REQUEST",
    github_pr_merge: "GITHUB_MERGE_A_PULL_REQUEST",
    github_pr_review: "GITHUB_CREATE_A_REVIEW_FOR_A_PULL_REQUEST",
    github_pr_update: "GITHUB_UPDATE_A_PULL_REQUEST",
    github_repo_create: "GITHUB_CREATE_AN_ORGANIZATION_REPOSITORY",

    // Slack — uses "slackbot" Composio app (the "slack" app has legacy "bot" scope that breaks OAuth v2)
    // Verified against Composio API 2026-02-16
    slack_channels_list: "SLACKBOT_LIST_ALL_CHANNELS",
    slack_messages_list: "SLACKBOT_FETCH_CONVERSATION_HISTORY",
    slack_thread_replies_list: "SLACKBOT_FETCH_MESSAGE_THREAD_FROM_A_CONVERSATION",
    slack_users_list: "SLACKBOT_LIST_ALL_USERS",
    slack_search_messages: "SLACKBOT_SEARCH_MESSAGES",
    slack_post_message: "SLACKBOT_SEND_MESSAGE",
    slack_reply_thread: "SLACKBOT_SEND_MESSAGE",
    slack_conversation_info: "SLACKBOT_RETRIEVE_CONVERSATION_INFORMATION",
    slack_files_list: "SLACKBOT_LIST_FILES_WITH_FILTERS_IN_SLACK",
    slack_add_reaction: "SLACKBOT_ADD_REACTION_TO_AN_ITEM",
    slack_find_channels: "SLACKBOT_FIND_CHANNELS",
    slack_find_users: "SLACKBOT_FIND_USERS",
    slack_channel_create: "SLACKBOT_CREATE_A_CHANNEL",
    slack_set_topic: "SLACKBOT_SET_CONVERSATION_TOPIC",
    slack_invite_to_channel: "SLACKBOT_INVITE_USER_TO_CHANNEL",

    // Notion — verified against Composio API 2026-02-14
    notion_pages_search: "NOTION_SEARCH_NOTION_PAGE",
    notion_databases_list: "NOTION_SEARCH_NOTION_PAGE",
    notion_databases_query: "NOTION_QUERY_DATABASE",
    notion_database_retrieve: "NOTION_FETCH_DATABASE",
    notion_page_retrieve: "NOTION_FETCH_DATA",
    notion_block_children_list: "NOTION_FETCH_BLOCK_CONTENTS",
    notion_page_create: "NOTION_CREATE_NOTION_PAGE",
    notion_page_update: "NOTION_UPDATE_PAGE",
    notion_block_append: "NOTION_APPEND_BLOCK_CHILDREN",

    // Linear — verified against Composio API 2026-02-14
    linear_issues_list: "LINEAR_LIST_LINEAR_ISSUES",
    linear_teams_list: "LINEAR_LIST_LINEAR_TEAMS",
    linear_projects_list: "LINEAR_LIST_LINEAR_PROJECTS",
    linear_cycles_list: "LINEAR_LIST_LINEAR_CYCLES",
    linear_labels_list: "LINEAR_LIST_LINEAR_LABELS",
    linear_workflow_states_list: "LINEAR_LIST_LINEAR_STATES",
    linear_issue_update_status: "LINEAR_UPDATE_ISSUE",
    linear_issue_assign: "LINEAR_UPDATE_ISSUE",
    linear_issue_comment: "LINEAR_CREATE_LINEAR_COMMENT",
    linear_issue_create: "LINEAR_CREATE_LINEAR_ISSUE",
    linear_issue_update: "LINEAR_UPDATE_ISSUE",

    // Google (mapped to googlesheets Composio app) — Sheets actions only
    // AI may generate gmail/calendar/drive capabilityIds — all fallback to Sheets search
    google_gmail_list: "GOOGLESHEETS_SEARCH_SPREADSHEETS",
    google_drive_list: "GOOGLESHEETS_SEARCH_SPREADSHEETS",
    google_sheets_get: "GOOGLESHEETS_BATCH_GET",
    google_sheets_search: "GOOGLESHEETS_SEARCH_SPREADSHEETS",
    google_calendar_list: "GOOGLESHEETS_SEARCH_SPREADSHEETS",

    // Trello — verified against Composio API 2026-02-16
    trello_boards_list: "TRELLO_GET_MEMBERS_BOARDS_BY_ID_MEMBER",
    trello_boards_get: "TRELLO_GET_BOARDS_BY_ID_BOARD",
    trello_cards_list: "TRELLO_GET_BOARDS_CARDS_BY_ID_BOARD",
    trello_lists_list: "TRELLO_GET_BOARDS_LISTS_BY_ID_BOARD",
    trello_card_get: "TRELLO_CARD_GET_BY_ID",
    trello_card_create: "TRELLO_ADD_A_NEW_CARD",
    trello_card_update: "TRELLO_UPDATE_CARD_BY_ID",
    trello_card_delete: "TRELLO_DELETE_CARD",

    // Airtable — verified against Composio API 2026-02-16
    airtable_records_list: "AIRTABLE_LIST_RECORDS",
    airtable_bases_list: "AIRTABLE_LIST_BASES",
    airtable_record_create: "AIRTABLE_CREATE_NEW_RECORD",
    airtable_record_update: "AIRTABLE_UPDATE_RECORD",
    airtable_record_delete: "AIRTABLE_DELETE_RECORD",

    // Intercom — verified against Composio API 2026-02-16
    intercom_conversations_list: "INTERCOM_LIST_CONVERSATIONS",
    intercom_contacts_list: "INTERCOM_GET_A_CONTACT",
    intercom_companies_list: "INTERCOM_LIST_ALL_COMPANIES",
    intercom_search_conversations: "INTERCOM_SEARCH_CONVERSATIONS",
    intercom_contact_create: "INTERCOM_CREATE_A_CONTACT",
    intercom_message_send: "INTERCOM_SEND_A_MESSAGE",
    intercom_note_create: "INTERCOM_CREATE_A_NOTE",

    // Zoom — verified against Composio API 2026-02-16
    zoom_meetings_list: "ZOOM_LIST_MEETINGS",
    zoom_recordings_list: "ZOOM_LIST_ALL_RECORDINGS",
    zoom_meeting_create: "ZOOM_CREATE_A_MEETING",
    zoom_meeting_delete: "ZOOM_DELETE_A_MEETING",

    // GitLab — verified against Composio API 2026-02-16
    gitlab_projects_list: "GITLAB_GET_PROJECTS",
    gitlab_merge_requests_list: "GITLAB_GET_PROJECT_MERGE_REQUESTS",
    gitlab_commits_list: "GITLAB_LIST_REPOSITORY_COMMITS",
    gitlab_pipelines_list: "GITLAB_LIST_PROJECT_PIPELINES",
    gitlab_issue_create: "GITLAB_CREATE_AN_ISSUE",
    gitlab_issue_update: "GITLAB_EDIT_AN_ISSUE",
    gitlab_mr_create: "GITLAB_CREATE_MERGE_REQUEST",
    gitlab_mr_update: "GITLAB_UPDATE_MERGE_REQUEST",

    // Bitbucket — verified against Composio API 2026-02-16
    bitbucket_workspaces_list: "BITBUCKET_LIST_WORKSPACES",
    bitbucket_repos_list: "BITBUCKET_LIST_REPOSITORIES_IN_WORKSPACE",
    bitbucket_pull_requests_list: "BITBUCKET_LIST_PULL_REQUESTS",
    bitbucket_pr_create: "BITBUCKET_CREATE_PULL_REQUEST",
    bitbucket_repo_create: "BITBUCKET_CREATE_REPOSITORY",

    // Asana — verified against Composio API 2026-02-16
    asana_workspaces_list: "ASANA_GET_MULTIPLE_WORKSPACES",
    asana_tasks_list: "ASANA_GET_TASKS_FROM_A_PROJECT",
    asana_projects_list: "ASANA_GET_PROJECTS_FOR_TEAM",
    asana_workspace_projects_list: "ASANA_GET_WORKSPACE_PROJECTS",
    asana_task_create: "ASANA_CREATE_A_TASK",
    asana_task_update: "ASANA_UPDATE_A_TASK",
    asana_project_create: "ASANA_CREATE_A_PROJECT",

    // Microsoft Teams — verified against Composio API 2026-02-16
    teams_list: "MICROSOFT_TEAMS_TEAMS_LIST",
    teams_chats_list: "MICROSOFT_TEAMS_CHATS_GET_ALL_CHATS",
    teams_messages_list: "MICROSOFT_TEAMS_CHATS_GET_ALL_MESSAGES",
    teams_channels_list: "MICROSOFT_TEAMS_TEAMS_LIST_CHANNELS",
    teams_users_list: "MICROSOFT_TEAMS_LIST_USERS",
    teams_members_list: "MICROSOFT_TEAMS_LIST_TEAM_MEMBERS",
    teams_send_message: "MICROSOFT_TEAMS_CHATS_SEND_MESSAGE",
    teams_channel_create: "MICROSOFT_TEAMS_TEAMS_CREATE_CHANNEL",

    // Outlook — verified against Composio API 2026-02-16
    outlook_messages_list: "OUTLOOK_OUTLOOK_LIST_MESSAGES",
    outlook_events_list: "OUTLOOK_OUTLOOK_LIST_EVENTS",
    outlook_contacts_list: "OUTLOOK_OUTLOOK_LIST_CONTACTS",
    outlook_search_messages: "OUTLOOK_OUTLOOK_SEARCH_MESSAGES",
    outlook_send_email: "OUTLOOK_OUTLOOK_SEND_EMAIL",
    outlook_reply_email: "OUTLOOK_OUTLOOK_REPLY_TO_EMAIL",
    outlook_event_create: "OUTLOOK_OUTLOOK_CREATE_EVENT",

    // Stripe — verified against Composio API 2026-02-16
    stripe_charges_list: "STRIPE_LIST_CHARGES",
    stripe_customers_list: "STRIPE_LIST_CUSTOMERS",
    stripe_subscriptions_list: "STRIPE_LIST_SUBSCRIPTIONS",
    stripe_invoices_list: "STRIPE_LIST_INVOICES",
    stripe_products_list: "STRIPE_LIST_PRODUCTS",
    stripe_payments_list: "STRIPE_LIST_PAYMENT_INTENTS",
    stripe_customer_create: "STRIPE_CREATE_CUSTOMER",
    stripe_invoice_create: "STRIPE_CREATE_INVOICE",
    stripe_product_create: "STRIPE_CREATE_PRODUCT",

    // HubSpot — verified against Composio API 2026-02-16
    hubspot_contacts_list: "HUBSPOT_HUBSPOT_LIST_CONTACTS",
    hubspot_deals_list: "HUBSPOT_HUBSPOT_LIST_DEALS",
    hubspot_companies_list: "HUBSPOT_HUBSPOT_LIST_COMPANIES",
    hubspot_tickets_list: "HUBSPOT_LIST_TICKETS",
    hubspot_contact_create: "HUBSPOT_HUBSPOT_CREATE_CONTACT",
    hubspot_deal_create: "HUBSPOT_CREATE_A_NEW_DEAL",
    hubspot_company_create: "HUBSPOT_HUBSPOT_CREATE_COMPANY",
    hubspot_ticket_create: "HUBSPOT_CREATE_TICKET",

    // Discord — verified against Composio API 2026-02-16
    discord_guilds_list: "DISCORD_LIST_MY_GUILDS",
    discord_connections_list: "DISCORD_LIST_MY_CONNECTIONS",

    // ClickUp — verified against Composio API 2026-02-16
    clickup_teams_list: "CLICKUP_GET_AUTHORIZED_TEAMS_WORKSPACES",
    clickup_tasks_list: "CLICKUP_GET_TASKS",
    clickup_spaces_list: "CLICKUP_GET_SPACES",
    clickup_lists_list: "CLICKUP_GET_LISTS",
    clickup_task_create: "CLICKUP_CREATE_TASK",
    clickup_task_update: "CLICKUP_UPDATE_TASK",

    // Salesforce — write actions
    salesforce_records_query: "SALESFORCE_SALESFORCE_QUERY_RECORDS",
    salesforce_record_create: "SALESFORCE_SALESFORCE_CREATE_RECORD",
    salesforce_record_update: "SALESFORCE_SALESFORCE_UPDATE_RECORD",

    // Zendesk — write actions
    zendesk_tickets_list: "ZENDESK_LIST_TICKETS",
    zendesk_ticket_create: "ZENDESK_CREATE_TICKET",
    zendesk_ticket_update: "ZENDESK_UPDATE_TICKET",

    // Jira — write actions
    jira_issues_search: "JIRA_SEARCH_JIRA_ISSUES",
    jira_issue_get: "JIRA_GET_ISSUE",
    jira_issue_create: "JIRA_CREATE_ISSUE",
    jira_issue_update: "JIRA_EDIT_ISSUE",
    jira_issue_transition: "JIRA_TRANSITION_ISSUE",

    // QuickBooks — verified against Composio API 2026-02-16
    quickbooks_accounts_query: "QUICKBOOKS_QUERY_ACCOUNT",
    quickbooks_accounts_read: "QUICKBOOKS_READ_ACCOUNT",
    quickbooks_customers_read: "QUICKBOOKS_READ_CUSTOMER",
    quickbooks_vendors_read: "QUICKBOOKS_READ_VENDOR",
    quickbooks_balance_detail: "QUICKBOOKS_CUSTOMER_BALANCE_DETAIL",
    quickbooks_balance_report: "QUICKBOOKS_CUSTOMER_BALANCE_REPORT",

    // Google Analytics — verified against Composio API 2026-02-16
    google_analytics_reports_run: "GOOGLE_ANALYTICS_LIST_ACCOUNTS",
    google_analytics_accounts_list: "GOOGLE_ANALYTICS_LIST_ACCOUNTS",
    google_analytics_audiences_list: "GOOGLE_ANALYTICS_LIST_AUDIENCES",
    google_analytics_account_get: "GOOGLE_ANALYTICS_GET_ACCOUNT",
};

/**
 * Check if a capability ID has a known Composio action mapping.
 * Used by the compiler/validator to accept capabilities that exist in our mapping
 * but aren't in the static capability registry.
 */
export function hasComposioMapping(capabilityId: string): boolean {
    return capabilityId in STATIC_TO_COMPOSIO;
}

/**
 * Normalize AI-generated Composio action names to correct ones.
 * The AI sometimes generates action names using old app prefixes
 * (e.g., SLACK_ instead of SLACKBOT_) because it doesn't know about renames.
 */
const ACTION_PREFIX_REMAP: Record<string, string> = {
    "SLACK_": "SLACKBOT_",
};

/**
 * Exact action name remaps for AI-guessed action names.
 * The AI often generates plausible but incorrect Composio action names.
 * These remap them to the correct, tested action names.
 */
const ACTION_EXACT_REMAP: Record<string, string> = {
    // Trello — AI often shortens the long action name
    "TRELLO_MEMBER_GET_BOARDS": "TRELLO_GET_MEMBERS_BOARDS_BY_ID_MEMBER",
    "TRELLO_GET_BOARDS": "TRELLO_GET_MEMBERS_BOARDS_BY_ID_MEMBER",
    "TRELLO_LIST_BOARDS": "TRELLO_GET_MEMBERS_BOARDS_BY_ID_MEMBER",
    "TRELLO_GET_MY_BOARDS": "TRELLO_GET_MEMBERS_BOARDS_BY_ID_MEMBER",
    "TRELLO_GET_MEMBER_BOARDS": "TRELLO_GET_MEMBERS_BOARDS_BY_ID_MEMBER",
    // GitLab — AI uses user-specific endpoint that requires ID
    "GITLAB_LIST_USER_PROJECTS": "GITLAB_GET_PROJECTS",
    "GITLAB_LIST_PROJECTS": "GITLAB_GET_PROJECTS",
    "GITLAB_GET_ALL_PROJECTS": "GITLAB_GET_PROJECTS",
    "GITLAB_GET_USER_PROJECTS": "GITLAB_GET_PROJECTS",
    // ClickUp — AI shortens the verbose action name
    "CLICKUP_GET_TEAMS": "CLICKUP_GET_AUTHORIZED_TEAMS_WORKSPACES",
    "CLICKUP_LIST_TEAMS": "CLICKUP_GET_AUTHORIZED_TEAMS_WORKSPACES",
    "CLICKUP_GET_WORKSPACES": "CLICKUP_GET_AUTHORIZED_TEAMS_WORKSPACES",
    "CLICKUP_LIST_WORKSPACES": "CLICKUP_GET_AUTHORIZED_TEAMS_WORKSPACES",
    // Notion — AI sometimes uses alternative names
    "NOTION_SEARCH_PAGES": "NOTION_SEARCH_NOTION_PAGE",
    "NOTION_LIST_PAGES": "NOTION_SEARCH_NOTION_PAGE",
    "NOTION_SEARCH": "NOTION_SEARCH_NOTION_PAGE",
    // Zoom — AI generates wrong action names
    "ZOOM_LIST_ALL_MEETINGS": "ZOOM_LIST_MEETINGS",
    "ZOOM_GET_MEETINGS": "ZOOM_LIST_MEETINGS",
    // Outlook — AI sometimes uses different names
    "OUTLOOK_LIST_MESSAGES": "OUTLOOK_OUTLOOK_LIST_MESSAGES",
    "OUTLOOK_LIST_EMAILS": "OUTLOOK_OUTLOOK_LIST_MESSAGES",
    "OUTLOOK_LIST_EVENTS": "OUTLOOK_OUTLOOK_LIST_EVENTS",
    "OUTLOOK_LIST_CONTACTS": "OUTLOOK_OUTLOOK_LIST_CONTACTS",
    // Bitbucket — AI uses shortened names
    "BITBUCKET_GET_WORKSPACES": "BITBUCKET_LIST_WORKSPACES",
    // Asana
    "ASANA_LIST_WORKSPACES": "ASANA_GET_MULTIPLE_WORKSPACES",
    "ASANA_GET_WORKSPACES": "ASANA_GET_MULTIPLE_WORKSPACES",
    // HubSpot — AI generates search action that needs specific filter params; remap to list
    "HUBSPOT_SEARCH_DEALS_BY_CRITERIA": "HUBSPOT_HUBSPOT_LIST_DEALS",
    "HUBSPOT_SEARCH_DEALS": "HUBSPOT_HUBSPOT_LIST_DEALS",
    "HUBSPOT_GET_DEALS": "HUBSPOT_HUBSPOT_LIST_DEALS",
    // Intercom — AI generates activity logs action that needs created_at_after; remap to conversations
    "INTERCOM_LIST_ALL_ACTIVITY_LOGS": "INTERCOM_LIST_CONVERSATIONS",
    "INTERCOM_LIST_ACTIVITY_LOGS": "INTERCOM_LIST_CONVERSATIONS",
    "INTERCOM_GET_ACTIVITY_LOGS": "INTERCOM_LIST_CONVERSATIONS",
};

function normalizeActionId(actionId: string): string {
    // First check exact remaps
    if (ACTION_EXACT_REMAP[actionId]) {
        return ACTION_EXACT_REMAP[actionId];
    }

    // Check if the exact action exists in our static map values
    const knownActions = new Set(Object.values(STATIC_TO_COMPOSIO));
    if (knownActions.has(actionId)) return actionId;

    // Apply prefix remaps for known app name changes
    for (const [oldPrefix, newPrefix] of Object.entries(ACTION_PREFIX_REMAP)) {
        if (actionId.startsWith(oldPrefix)) {
            const remapped = newPrefix + actionId.slice(oldPrefix.length);
            if (knownActions.has(remapped)) return remapped;
            // Check exact remap after prefix change
            if (ACTION_EXACT_REMAP[remapped]) return ACTION_EXACT_REMAP[remapped];
            // Even if not in our static map, use the remapped name
            return remapped;
        }
    }

    return actionId;
}

export class ComposioRuntime implements IntegrationRuntime {
    id = "composio";
    isComposio = true; // Special flag for runtime.ts to verify

    // Proxy to intercept capability access and return an executor
    get capabilities() {
        return new Proxy({}, {
            get: (_target, prop) => {
                const fullId = String(prop);

                return {
                    execute: async (input: any, context: any, _tracer: any) => {
                        // Resolve action ID: registry → static map → normalize
                        let actionId: string;

                        // Try ActionKit registry first (DB-backed)
                        const registryResolved = await resolveComposioActionName(fullId).catch(() => null);
                        if (registryResolved) {
                            actionId = registryResolved;
                        } else if (fullId.includes(":")) {
                            actionId = normalizeActionId(fullId.split(":")[1]);
                        } else {
                            actionId = STATIC_TO_COMPOSIO[fullId] ?? normalizeActionId(fullId);
                        }

                        // Ensure orgId is present in context
                        const orgId = context.orgId;
                        if (!orgId) {
                            throw new Error("Composio execution requires orgId in context");
                        }
                        // Convert raw orgId to Composio entity ID (assemblr_org_<orgId>)
                        const entityId = getComposioEntityId(orgId);

                        // Smart fallbacks for actions that need context params we may not have
                        let resolvedActionId = actionId;
                        let resolvedInput = input;

                        // GitHub: LIST_REPOSITORY_ISSUES needs owner/repo — fall back to search
                        if (resolvedActionId === "GITHUB_LIST_REPOSITORY_ISSUES" && (!resolvedInput?.owner || !resolvedInput?.repo)) {
                            console.log("[Composio] GitHub issues: missing owner/repo, falling back to SEARCH_ISSUES_AND_PULL_REQUESTS");
                            resolvedActionId = "GITHUB_SEARCH_ISSUES_AND_PULL_REQUESTS";
                            const { owner, repo, ...rest } = resolvedInput || {};
                            resolvedInput = { ...rest, q: resolvedInput?.q || "is:issue is:open" };
                        }

                        // GitHub: SEARCH_ISSUES_AND_PULL_REQUESTS always requires `q`
                        if (resolvedActionId === "GITHUB_SEARCH_ISSUES_AND_PULL_REQUESTS" && !resolvedInput?.q) {
                            console.log("[Composio] GitHub search: missing q param, adding default");
                            resolvedInput = { ...resolvedInput, q: "is:issue is:open" };
                        }

                        // CRITICAL: Scope ALL GitHub search queries to the user's own repos.
                        // Without this, GitHub's search API returns results from ALL of GitHub.
                        const GITHUB_SEARCH_ACTIONS = new Set([
                            "GITHUB_SEARCH_ISSUES_AND_PULL_REQUESTS",
                            "GITHUB_SEARCH_CODE",
                            "GITHUB_SEARCH_REPOSITORIES",
                            "GITHUB_SEARCH_USERS",
                            "GITHUB_SEARCH_TOPICS",
                            "GITHUB_SEARCH_COMMITS",
                            "GITHUB_SEARCH_LABELS",
                        ]);
                        if (GITHUB_SEARCH_ACTIONS.has(resolvedActionId) && resolvedInput?.q) {
                            const q = String(resolvedInput.q);
                            // Only scope if the query doesn't already have a user/repo/org scope
                            if (!q.includes("user:") && !q.includes("repo:") && !q.includes("org:")) {
                                const ghUsername = await getGitHubUsername(entityId);
                                if (ghUsername) {
                                    resolvedInput = { ...resolvedInput, q: `${q} user:${ghUsername}` };
                                    console.log(`[Composio] Scoped GitHub search to user:${ghUsername}`);
                                } else {
                                    console.warn("[Composio] Could not scope GitHub search — username unavailable");
                                }
                            }
                        }

                        // Asana: GET_TASKS_FROM_A_PROJECT needs project_gid — fall back to workspaces
                        if (resolvedActionId === "ASANA_GET_TASKS_FROM_A_PROJECT" && !resolvedInput?.project_gid) {
                            console.log("[Composio] Asana tasks: missing project_gid, falling back to GET_MULTIPLE_WORKSPACES");
                            resolvedActionId = "ASANA_GET_MULTIPLE_WORKSPACES";
                            const { project_gid, ...rest } = resolvedInput || {};
                            resolvedInput = rest;
                        }

                        return await executeAction(entityId, resolvedActionId, resolvedInput);
                    }
                }
            }
        }) as Record<string, any>;
    }

    async resolveContext(params: any): Promise<Record<string, any>> {
        // params is the orgId passed from runtime.ts
        return { orgId: params };
    }
}
