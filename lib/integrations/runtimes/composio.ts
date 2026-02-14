
import { executeAction } from "@/lib/integrations/composio/execution";
import { getComposioEntityId } from "@/lib/integrations/composio/connection";
import { IntegrationRuntime } from "@/lib/execution/types";

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

    // Slack — verified against Composio API 2026-02-14
    slack_channels_list: "SLACK_LIST_CONVERSATIONS",
    slack_messages_list: "SLACK_FETCH_CONVERSATION_HISTORY",
    slack_thread_replies_list: "SLACK_FETCH_MESSAGE_THREAD_FROM_A_CONVERSATION",
    slack_users_list: "SLACK_LIST_ALL_USERS",
    slack_search_messages: "SLACK_SEARCH_MESSAGES",
    slack_post_message: "SLACK_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL",
    slack_reply_thread: "SLACK_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL",
    slack_conversation_info: "SLACK_RETRIEVE_CONVERSATION_INFORMATION",
    slack_files_list: "SLACK_LIST_FILES_WITH_FILTERS_IN_SLACK",
    slack_add_reaction: "SLACK_ADD_REACTION_TO_AN_ITEM",

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

    // Google (mapped to googlesheets Composio app) — verified 2026-02-14
    google_gmail_list: "GOOGLESHEETS_BATCH_GET",
    google_drive_list: "GOOGLESHEETS_SEARCH_SPREADSHEETS",
    google_sheets_get: "GOOGLESHEETS_BATCH_GET",
    google_calendar_list: "GOOGLESHEETS_BATCH_GET",
};

export class ComposioRuntime implements IntegrationRuntime {
    id = "composio";
    isComposio = true; // Special flag for runtime.ts to verify

    // Proxy to intercept capability access and return an executor
    get capabilities() {
        return new Proxy({}, {
            get: (_target, prop) => {
                const fullId = String(prop);
                // Capability IDs are formatted as "integration:action"
                // Composio action IDs (from synthesized metadata) are already prefixed with APP_
                // Examples: "github:GITHUB_GET_REPO", "linear:LINEAR_LIST_ISSUES"
                // The executor needs the part after the colon.
                let actionId: string;
                if (fullId.includes(":")) {
                    actionId = fullId.split(":")[1];
                } else {
                    // Static capability ID — resolve to Composio action name
                    actionId = STATIC_TO_COMPOSIO[fullId] ?? fullId;
                }

                return {
                    execute: async (input: any, context: any, _tracer: any) => {
                        // Ensure orgId is present in context
                        const orgId = context.orgId;
                        if (!orgId) {
                            throw new Error("Composio execution requires orgId in context");
                        }
                        // Convert raw orgId to Composio entity ID (assemblr_org_<orgId>)
                        const entityId = getComposioEntityId(orgId);
                        return await executeAction(entityId, actionId, input);
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
