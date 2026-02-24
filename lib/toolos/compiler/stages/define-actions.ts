import { getAzureOpenAIClient } from "@/lib/ai/azureOpenAI";
import { getServerEnv } from "@/lib/env";
import { ActionSpec, IntegrationId, IntegrationIdSchema } from "@/lib/toolos/spec";
import type { ToolCompilerStageContext, ToolCompilerStageResult } from "@/lib/toolos/compiler/tool-compiler";

/** Maximum actions to define per tool */
const MAX_ACTIONS = 8;

export async function runDefineActions(
  ctx: ToolCompilerStageContext,
): Promise<ToolCompilerStageResult> {
  const integrations = ctx.spec.integrations.map((i) => i.id);
  // Build a richer capability catalog showing type (read/write) info
  const capabilityCatalog = integrations
    .map((id) => {
      const caps = ctx.capabilities.filter(c => c.integrationId === id);
      const lines = caps.map((c) => {
        const opType = inferCapabilityType(c);
        return `  - ${c.id} (${opType})`;
      });
      return `${id}:\n${lines.join("\n")}`;
    })
    .join("\n");
  // Leverage goal_plan and entities for better action targeting
  const goalContext = ctx.spec.goal_plan
    ? `\nGoal: ${ctx.spec.goal_plan.primary_goal}\nGoal type: ${ctx.spec.goal_plan.kind}`
    : "";

  const entityContext = ctx.spec.entities?.length > 0
    ? `\nEntities to populate: ${ctx.spec.entities.map((e) => `${e.name} (${e.sourceIntegration})`).join(", ")}`
    : "";

  const response = await getAzureOpenAIClient().chat.completions.create({
    model: getServerEnv().AZURE_OPENAI_DEPLOYMENT_NAME!,
    messages: [
      {
        role: "system",
        content:
          `Return JSON: {"actions":[{"id":string,"name":string,"description":string,"type":"READ"|"WRITE"|"MUTATE"|"NOTIFY","integrationId":string,"capabilityId":string,"inputSchema":object,"outputSchema":object,"requiresApproval":boolean}]}.

Action types:
- READ: Fetches/queries data (list, get, search)
- WRITE: Creates new resources (create issue, send message, create doc)
- MUTATE: Updates/deletes existing resources (update issue, close PR, archive)
- NOTIFY: Sends notifications (post to Slack, send email)

CRITICAL RULES:
- Include ONLY the 2-6 most relevant actions to answer the user's specific request
- Do NOT generate an action for every integration — only for integrations that directly serve the request
- For READ-heavy requests (dashboards, monitoring), focus on 2-4 READ actions that fetch the most useful data
- For action-heavy requests (automation, workflows), include both READ and WRITE/MUTATE actions
- Set requiresApproval=true for WRITE/MUTATE/NOTIFY actions
- Set requiresApproval=false for READ actions
- Only use capabilities from the catalog below
- Fewer, more targeted actions produce better results than many unfocused ones

ACTION NAMING:
- Use clear, descriptive names: "List open issues" not just "List"
- Include the integration in the description: "Fetch GitHub pull requests" not just "Fetch data"
- The "id" should follow the pattern: "integrationId.actionVerb" (e.g. "github.listIssues")

${capabilityCatalog}`,
      },
      { role: "user", content: ctx.prompt + goalContext + entityContext },
    ],
    temperature: 0,
    max_tokens: 800,
    response_format: { type: "json_object" },
  });
  await ctx.onUsage?.(response.usage);
  const content = response.choices[0]?.message?.content;
  if (content) {
    console.log("[ToolCompilerLLMOutput]", { stage: "define-actions", content });
  }
  if (!content) return { specPatch: { actions: buildFallbackActions(integrations, ctx.prompt) } };
  try {
    const json = JSON.parse(content);
    const actions: ActionSpec[] = Array.isArray(json.actions)
      ? json.actions.flatMap((action: any) => {
        if (!action || typeof action !== "object") return [];
        if (typeof action.integrationId !== "string" || typeof action.capabilityId !== "string") return [];
        const integrationId = IntegrationIdSchema.safeParse(action.integrationId);
        if (!integrationId.success) return [];
        if (!integrationId.success) return [];
        const cap = ctx.capabilities.find(c => c.id === action.capabilityId);
        if (!cap || cap.integrationId !== integrationId.data) return [];
        const name = typeof action.name === "string" && action.name.trim().length > 0 ? action.name.trim() : "Action";
        const description =
          typeof action.description === "string" && action.description.trim().length > 0
            ? action.description.trim()
            : name;
        const id =
          typeof action.id === "string" && action.id.trim().length > 0
            ? action.id.trim()
            : `${integrationId.data}.${action.capabilityId}`;
        const inputSchema =
          action.inputSchema && typeof action.inputSchema === "object" ? action.inputSchema : {};
        const outputSchema =
          action.outputSchema && typeof action.outputSchema === "object" ? action.outputSchema : {};
        // Determine action type from LLM output, capability type, or allowed operations
        const actionType = resolveActionType(action.type, cap);
        const isRead = actionType === "READ";
        const safeAction: ActionSpec = {
          id,
          name,
          description,
          type: actionType,
          integrationId: integrationId.data,
          capabilityId: action.capabilityId,
          inputSchema,
          outputSchema,
          writesToState: !isRead,
          requiresApproval: !isRead && action.requiresApproval !== false,
        };
        return [safeAction];
      })
      : [];
    if (actions.length === 0) {
      return { specPatch: { actions: buildFallbackActions(integrations, ctx.prompt) } };
    }
    // Hard cap on actions — prevent over-generation
    return { specPatch: { actions: actions.slice(0, MAX_ACTIONS) } };
  } catch {
    return { specPatch: { actions: buildFallbackActions(integrations, ctx.prompt) } };
  }
}

/**
 * Infer the capability type string for catalog display.
 */
function inferCapabilityType(cap: any): string {
  const capType = cap.type as string | undefined;
  if (capType === "create" || capType === "update" || capType === "delete") return "write";
  if (capType === "list" || capType === "get" || capType === "search") return "read";
  const ops = cap.allowedOperations ?? [];
  if (ops.includes("read")) return "read";
  return "write";
}

/**
 * Resolve the ActionSpec type from LLM output and capability metadata.
 */
function resolveActionType(llmType: string | undefined, cap: any): "READ" | "WRITE" | "MUTATE" | "NOTIFY" {
  // Trust LLM output if it's a valid type
  if (llmType === "READ" || llmType === "WRITE" || llmType === "MUTATE" || llmType === "NOTIFY") {
    return llmType;
  }

  // Fall back to capability metadata
  const capType = cap.type as string | undefined;
  if (capType === "create") return "WRITE";
  if (capType === "update") return "MUTATE";
  if (capType === "delete") return "MUTATE";

  const ops = cap.allowedOperations ?? [];
  if (ops.includes("read")) return "READ";

  // Default: if name suggests sending/posting, it's NOTIFY
  const name = (cap.name ?? cap.id ?? "").toLowerCase();
  if (name.includes("send") || name.includes("post") || name.includes("notify")) return "NOTIFY";

  return "WRITE";
}

/** Detect write intent from prompt keywords */
const WRITE_INTENT_RE =
  /\b(create|add|post|send|assign|close|update|move|delete|remove|archive|merge|invite|reply|transition)\b/i;

/** Helper to build a single action spec */
function action(
  id: string,
  name: string,
  description: string,
  type: "READ" | "WRITE" | "MUTATE" | "NOTIFY",
  integrationId: IntegrationId,
  capabilityId: string,
): ActionSpec {
  const isRead = type === "READ";
  return {
    id,
    name,
    description,
    type,
    integrationId,
    capabilityId,
    inputSchema: {},
    outputSchema: {},
    writesToState: !isRead,
    requiresApproval: !isRead,
  };
}

function buildFallbackActions(integrations: IntegrationId[], prompt: string): ActionSpec[] {
  const p = prompt.toLowerCase();
  const wantWrite = WRITE_INTENT_RE.test(p);

  const allActions = integrations.flatMap((integration) => {
    const actions: ActionSpec[] = [];

    switch (integration) {
      // ── GitHub ──
      case "github": {
        if (/\bcommits?\b/.test(p)) {
          actions.push(action("github.listCommits", "List commits", "List GitHub commits", "READ", "github", "github_commits_list"));
        } else if (/\bissues?\b/.test(p)) {
          actions.push(action("github.listIssues", "List issues", "List GitHub issues", "READ", "github", "github_issues_list"));
        } else if (/\bpull\s*requests?\b|\bprs?\b/.test(p)) {
          actions.push(action("github.searchPRs", "Search pull requests", "Search GitHub pull requests", "READ", "github", "github_pull_requests_search"));
        } else {
          actions.push(action("github.listRepos", "List repositories", "List GitHub repositories", "READ", "github", "github_repos_list"));
        }
        if (wantWrite) {
          if (/\bissues?\b/.test(p) && /\bcreate\b/.test(p)) actions.push(action("github.createIssue", "Create issue", "Create a GitHub issue", "WRITE", "github", "github_issue_create"));
          if (/\bpull\s*requests?\b|\bprs?\b/.test(p) && /\bcreate\b/.test(p)) actions.push(action("github.createPR", "Create pull request", "Create a GitHub pull request", "WRITE", "github", "github_pr_create"));
          if (/\bmerge\b/.test(p)) actions.push(action("github.mergePR", "Merge pull request", "Merge a GitHub pull request", "MUTATE", "github", "github_pr_merge"));
          if (/\bassign\b/.test(p)) actions.push(action("github.assignIssue", "Assign issue", "Assign a GitHub issue", "MUTATE", "github", "github_issue_assign"));
          if (/\bclose\b/.test(p)) actions.push(action("github.closeIssue", "Close issue", "Close a GitHub issue", "MUTATE", "github", "github_issue_close"));
          if (/\blabel\b/.test(p)) actions.push(action("github.labelIssue", "Label issue", "Add labels to a GitHub issue", "MUTATE", "github", "github_issue_label"));
        }
        break;
      }

      // ── Linear ──
      case "linear": {
        if (/\bteams?\b/.test(p)) {
          actions.push(action("linear.listTeams", "List teams", "List Linear teams", "READ", "linear", "linear_teams_list"));
        } else if (/\bprojects?\b/.test(p)) {
          actions.push(action("linear.listProjects", "List projects", "List Linear projects", "READ", "linear", "linear_projects_list"));
        } else if (/\bcycles?\b/.test(p)) {
          actions.push(action("linear.listCycles", "List cycles", "List Linear cycles", "READ", "linear", "linear_cycles_list"));
        } else {
          actions.push(action("linear.listIssues", "List issues", "List Linear issues", "READ", "linear", "linear_issues_list"));
        }
        if (wantWrite) {
          if (/\bcreate\b/.test(p)) actions.push(action("linear.createIssue", "Create issue", "Create a Linear issue", "WRITE", "linear", "linear_issue_create"));
          if (/\bupdate|assign|close|move\b/.test(p)) actions.push(action("linear.updateIssue", "Update issue", "Update a Linear issue", "MUTATE", "linear", "linear_issue_update"));
        }
        break;
      }

      // ── Slack ──
      case "slack": {
        if (/\bchannels?\b/.test(p)) {
          actions.push(action("slack.listChannels", "List channels", "List Slack channels", "READ", "slack", "slack_channels_list"));
        } else if (/\busers?\b|\bmembers?\b/.test(p)) {
          actions.push(action("slack.listUsers", "List users", "List Slack users", "READ", "slack", "slack_users_list"));
        } else if (/\bfiles?\b/.test(p)) {
          actions.push(action("slack.listFiles", "List files", "List Slack files", "READ", "slack", "slack_files_list"));
        } else if (/\bsearch\b/.test(p)) {
          actions.push(action("slack.searchMessages", "Search messages", "Search Slack messages", "READ", "slack", "slack_search_messages"));
        } else {
          actions.push(action("slack.listMessages", "List messages", "List Slack messages", "READ", "slack", "slack_messages_list"));
        }
        if (wantWrite) {
          if (/\bsend|post|reply\b/.test(p)) actions.push(action("slack.postMessage", "Send message", "Send a Slack message", "NOTIFY", "slack", "slack_post_message"));
          if (/\bcreate\b.*\bchannel\b|\bchannel\b.*\bcreate\b/.test(p)) actions.push(action("slack.createChannel", "Create channel", "Create a Slack channel", "WRITE", "slack", "slack_channel_create"));
          if (/\binvite\b/.test(p)) actions.push(action("slack.inviteToChannel", "Invite to channel", "Invite user to Slack channel", "MUTATE", "slack", "slack_invite_to_channel"));
        }
        break;
      }

      // ── Notion ──
      case "notion": {
        if (/\bdatabases?\b/.test(p)) {
          actions.push(action("notion.queryDatabase", "Query database", "Query a Notion database", "READ", "notion", "notion_databases_query"));
        } else {
          actions.push(action("notion.listPages", "List pages", "Search Notion pages", "READ", "notion", "notion_pages_search"));
        }
        if (wantWrite) {
          if (/\bcreate\b/.test(p)) actions.push(action("notion.createPage", "Create page", "Create a Notion page", "WRITE", "notion", "notion_page_create"));
          if (/\bupdate\b/.test(p)) actions.push(action("notion.updatePage", "Update page", "Update a Notion page", "MUTATE", "notion", "notion_page_update"));
        }
        break;
      }

      // ── Google (Sheets only) ──
      case "google": {
        if (/\bsheets?\b|\bspreadsheets?\b/.test(p)) {
          actions.push(action("google.searchSheets", "Search spreadsheets", "Search Google Sheets", "READ", "google", "google_sheets_search"));
        } else {
          actions.push(action("google.listEmails", "List emails", "List recent Gmail emails", "READ", "google", "google_gmail_list"));
        }
        break;
      }

      // ── Trello ──
      case "trello": {
        if (/\bcards?\b/.test(p)) {
          actions.push(action("trello.listCards", "List cards", "List Trello cards", "READ", "trello", "trello_cards_list"));
        } else if (/\blists?\b/.test(p)) {
          actions.push(action("trello.listLists", "List lists", "List Trello lists", "READ", "trello", "trello_lists_list"));
        } else {
          actions.push(action("trello.listBoards", "List boards", "List Trello boards", "READ", "trello", "trello_boards_list"));
        }
        if (wantWrite) {
          if (/\bcreate\b/.test(p)) actions.push(action("trello.createCard", "Create card", "Create a Trello card", "WRITE", "trello", "trello_card_create"));
          if (/\bupdate|move\b/.test(p)) actions.push(action("trello.updateCard", "Update card", "Update a Trello card", "MUTATE", "trello", "trello_card_update"));
          if (/\bdelete|remove\b/.test(p)) actions.push(action("trello.deleteCard", "Delete card", "Delete a Trello card", "MUTATE", "trello", "trello_card_delete"));
        }
        break;
      }

      // ── Airtable ──
      case "airtable": {
        if (/\bbases?\b/.test(p)) {
          actions.push(action("airtable.listBases", "List bases", "List Airtable bases", "READ", "airtable", "airtable_bases_list"));
        } else {
          actions.push(action("airtable.listRecords", "List records", "List Airtable records", "READ", "airtable", "airtable_records_list"));
        }
        if (wantWrite) {
          if (/\bcreate|add\b/.test(p)) actions.push(action("airtable.createRecord", "Create record", "Create an Airtable record", "WRITE", "airtable", "airtable_record_create"));
          if (/\bupdate\b/.test(p)) actions.push(action("airtable.updateRecord", "Update record", "Update an Airtable record", "MUTATE", "airtable", "airtable_record_update"));
          if (/\bdelete|remove\b/.test(p)) actions.push(action("airtable.deleteRecord", "Delete record", "Delete an Airtable record", "MUTATE", "airtable", "airtable_record_delete"));
        }
        break;
      }

      // ── Intercom ──
      case "intercom": {
        if (/\bcontacts?\b|\bcustomers?\b/.test(p)) {
          actions.push(action("intercom.listContacts", "List contacts", "List Intercom contacts", "READ", "intercom", "intercom_contacts_list"));
        } else if (/\bcompan(y|ies)\b/.test(p)) {
          actions.push(action("intercom.listCompanies", "List companies", "List Intercom companies", "READ", "intercom", "intercom_companies_list"));
        } else {
          actions.push(action("intercom.listConversations", "List conversations", "List Intercom conversations", "READ", "intercom", "intercom_conversations_list"));
        }
        if (wantWrite) {
          if (/\bcreate\b.*\bcontact\b|\bcontact\b.*\bcreate\b|add\b.*\bcontact\b/.test(p)) actions.push(action("intercom.createContact", "Create contact", "Create an Intercom contact", "WRITE", "intercom", "intercom_contact_create"));
          if (/\bsend|message|reply\b/.test(p)) actions.push(action("intercom.sendMessage", "Send message", "Send an Intercom message", "NOTIFY", "intercom", "intercom_message_send"));
        }
        break;
      }

      // ── Zoom ──
      case "zoom": {
        if (/\brecordings?\b/.test(p)) {
          actions.push(action("zoom.listRecordings", "List recordings", "List Zoom recordings", "READ", "zoom", "zoom_recordings_list"));
        } else {
          actions.push(action("zoom.listMeetings", "List meetings", "List Zoom meetings", "READ", "zoom", "zoom_meetings_list"));
        }
        if (wantWrite) {
          if (/\bcreate|schedule\b/.test(p)) actions.push(action("zoom.createMeeting", "Create meeting", "Create a Zoom meeting", "WRITE", "zoom", "zoom_meeting_create"));
          if (/\bdelete|cancel\b/.test(p)) actions.push(action("zoom.deleteMeeting", "Delete meeting", "Delete a Zoom meeting", "MUTATE", "zoom", "zoom_meeting_delete"));
        }
        break;
      }

      // ── GitLab ──
      case "gitlab": {
        if (/\bmerge\s*requests?\b|\bmrs?\b/.test(p)) {
          actions.push(action("gitlab.listMRs", "List merge requests", "List GitLab merge requests", "READ", "gitlab", "gitlab_merge_requests_list"));
        } else if (/\bpipelines?\b|\bci\b/.test(p)) {
          actions.push(action("gitlab.listPipelines", "List pipelines", "List GitLab pipelines", "READ", "gitlab", "gitlab_pipelines_list"));
        } else if (/\bcommits?\b/.test(p)) {
          actions.push(action("gitlab.listCommits", "List commits", "List GitLab commits", "READ", "gitlab", "gitlab_commits_list"));
        } else {
          actions.push(action("gitlab.listProjects", "List projects", "List GitLab projects", "READ", "gitlab", "gitlab_projects_list"));
        }
        if (wantWrite) {
          if (/\bissues?\b.*\bcreate\b|\bcreate\b.*\bissues?\b/.test(p)) actions.push(action("gitlab.createIssue", "Create issue", "Create a GitLab issue", "WRITE", "gitlab", "gitlab_issue_create"));
          if (/\bmerge\s*request|mr\b/.test(p) && /\bcreate\b/.test(p)) actions.push(action("gitlab.createMR", "Create merge request", "Create a GitLab merge request", "WRITE", "gitlab", "gitlab_mr_create"));
        }
        break;
      }

      // ── Bitbucket ──
      case "bitbucket": {
        if (/\bpull\s*requests?\b|\bprs?\b/.test(p)) {
          actions.push(action("bitbucket.listPRs", "List pull requests", "List Bitbucket pull requests", "READ", "bitbucket", "bitbucket_pull_requests_list"));
        } else if (/\bworkspaces?\b/.test(p)) {
          actions.push(action("bitbucket.listWorkspaces", "List workspaces", "List Bitbucket workspaces", "READ", "bitbucket", "bitbucket_workspaces_list"));
        } else {
          actions.push(action("bitbucket.listRepos", "List repositories", "List Bitbucket repositories", "READ", "bitbucket", "bitbucket_repos_list"));
        }
        if (wantWrite) {
          if (/\bcreate\b.*\bpr\b|\bpull\s*request\b.*\bcreate\b/.test(p)) actions.push(action("bitbucket.createPR", "Create pull request", "Create a Bitbucket pull request", "WRITE", "bitbucket", "bitbucket_pr_create"));
        }
        break;
      }

      // ── Asana ──
      case "asana": {
        if (/\bprojects?\b/.test(p)) {
          actions.push(action("asana.listProjects", "List projects", "List Asana projects", "READ", "asana", "asana_projects_list"));
        } else if (/\bworkspaces?\b/.test(p)) {
          actions.push(action("asana.listWorkspaces", "List workspaces", "List Asana workspaces", "READ", "asana", "asana_workspaces_list"));
        } else {
          actions.push(action("asana.listTasks", "List tasks", "List Asana tasks", "READ", "asana", "asana_tasks_list"));
        }
        if (wantWrite) {
          if (/\bcreate|add\b/.test(p) && /\btasks?\b/.test(p)) actions.push(action("asana.createTask", "Create task", "Create an Asana task", "WRITE", "asana", "asana_task_create"));
          if (/\bupdate\b/.test(p)) actions.push(action("asana.updateTask", "Update task", "Update an Asana task", "MUTATE", "asana", "asana_task_update"));
          if (/\bcreate\b.*\bprojects?\b|\bprojects?\b.*\bcreate\b/.test(p)) actions.push(action("asana.createProject", "Create project", "Create an Asana project", "WRITE", "asana", "asana_project_create"));
        }
        break;
      }

      // ── Microsoft Teams ──
      case "microsoft_teams": {
        if (/\bchats?\b/.test(p)) {
          actions.push(action("teams.listChats", "List chats", "List Teams chats", "READ", "microsoft_teams", "teams_chats_list"));
        } else if (/\bmessages?\b/.test(p)) {
          actions.push(action("teams.listMessages", "List messages", "List Teams messages", "READ", "microsoft_teams", "teams_messages_list"));
        } else if (/\bchannels?\b/.test(p)) {
          actions.push(action("teams.listChannels", "List channels", "List Teams channels", "READ", "microsoft_teams", "teams_channels_list"));
        } else if (/\busers?\b|\bmembers?\b/.test(p)) {
          actions.push(action("teams.listUsers", "List users", "List Teams users", "READ", "microsoft_teams", "teams_users_list"));
        } else {
          actions.push(action("teams.listTeams", "List teams", "List Microsoft Teams", "READ", "microsoft_teams", "teams_list"));
        }
        if (wantWrite) {
          if (/\bsend|post|reply\b/.test(p)) actions.push(action("teams.sendMessage", "Send message", "Send a Teams message", "NOTIFY", "microsoft_teams", "teams_send_message"));
          if (/\bcreate\b.*\bchannel\b|\bchannel\b.*\bcreate\b/.test(p)) actions.push(action("teams.createChannel", "Create channel", "Create a Teams channel", "WRITE", "microsoft_teams", "teams_channel_create"));
        }
        break;
      }

      // ── Outlook ──
      case "outlook": {
        if (/\bevents?\b|\bcalendar\b/.test(p)) {
          actions.push(action("outlook.listEvents", "List events", "List Outlook calendar events", "READ", "outlook", "outlook_events_list"));
        } else if (/\bcontacts?\b/.test(p)) {
          actions.push(action("outlook.listContacts", "List contacts", "List Outlook contacts", "READ", "outlook", "outlook_contacts_list"));
        } else if (/\bsearch\b/.test(p)) {
          actions.push(action("outlook.searchMessages", "Search messages", "Search Outlook messages", "READ", "outlook", "outlook_search_messages"));
        } else {
          actions.push(action("outlook.listMessages", "List messages", "List Outlook messages", "READ", "outlook", "outlook_messages_list"));
        }
        if (wantWrite) {
          if (/\bsend|compose|email\b/.test(p)) actions.push(action("outlook.sendEmail", "Send email", "Send an Outlook email", "NOTIFY", "outlook", "outlook_send_email"));
          if (/\breply\b/.test(p)) actions.push(action("outlook.replyEmail", "Reply to email", "Reply to an Outlook email", "NOTIFY", "outlook", "outlook_reply_email"));
          if (/\bcreate\b.*\bevent\b|\bevent\b.*\bcreate\b|\bschedule\b/.test(p)) actions.push(action("outlook.createEvent", "Create event", "Create an Outlook calendar event", "WRITE", "outlook", "outlook_event_create"));
        }
        break;
      }

      // ── Stripe ──
      case "stripe": {
        if (/\bcustomers?\b/.test(p)) {
          actions.push(action("stripe.listCustomers", "List customers", "List Stripe customers", "READ", "stripe", "stripe_customers_list"));
        } else if (/\bsubscriptions?\b/.test(p)) {
          actions.push(action("stripe.listSubscriptions", "List subscriptions", "List Stripe subscriptions", "READ", "stripe", "stripe_subscriptions_list"));
        } else if (/\binvoices?\b/.test(p)) {
          actions.push(action("stripe.listInvoices", "List invoices", "List Stripe invoices", "READ", "stripe", "stripe_invoices_list"));
        } else if (/\bproducts?\b/.test(p)) {
          actions.push(action("stripe.listProducts", "List products", "List Stripe products", "READ", "stripe", "stripe_products_list"));
        } else if (/\bpayments?\b/.test(p)) {
          actions.push(action("stripe.listPayments", "List payments", "List Stripe payment intents", "READ", "stripe", "stripe_payments_list"));
        } else {
          actions.push(action("stripe.listCharges", "List charges", "List Stripe charges", "READ", "stripe", "stripe_charges_list"));
        }
        if (wantWrite) {
          if (/\bcreate\b.*\bcustomer\b|\bcustomer\b.*\bcreate\b/.test(p)) actions.push(action("stripe.createCustomer", "Create customer", "Create a Stripe customer", "WRITE", "stripe", "stripe_customer_create"));
          if (/\bcreate\b.*\binvoice\b|\binvoice\b.*\bcreate\b/.test(p)) actions.push(action("stripe.createInvoice", "Create invoice", "Create a Stripe invoice", "WRITE", "stripe", "stripe_invoice_create"));
        }
        break;
      }

      // ── HubSpot ──
      case "hubspot": {
        if (/\bdeals?\b/.test(p)) {
          actions.push(action("hubspot.listDeals", "List deals", "List HubSpot deals", "READ", "hubspot", "hubspot_deals_list"));
        } else if (/\bcompan(y|ies)\b/.test(p)) {
          actions.push(action("hubspot.listCompanies", "List companies", "List HubSpot companies", "READ", "hubspot", "hubspot_companies_list"));
        } else if (/\btickets?\b/.test(p)) {
          actions.push(action("hubspot.listTickets", "List tickets", "List HubSpot tickets", "READ", "hubspot", "hubspot_tickets_list"));
        } else {
          actions.push(action("hubspot.listContacts", "List contacts", "List HubSpot contacts", "READ", "hubspot", "hubspot_contacts_list"));
        }
        if (wantWrite) {
          if (/\bcreate\b.*\bcontact\b|\bcontact\b.*\bcreate\b/.test(p)) actions.push(action("hubspot.createContact", "Create contact", "Create a HubSpot contact", "WRITE", "hubspot", "hubspot_contact_create"));
          if (/\bcreate\b.*\bdeal\b|\bdeal\b.*\bcreate\b/.test(p)) actions.push(action("hubspot.createDeal", "Create deal", "Create a HubSpot deal", "WRITE", "hubspot", "hubspot_deal_create"));
          if (/\bcreate\b.*\bcompan|\bcompan.*\bcreate\b/.test(p)) actions.push(action("hubspot.createCompany", "Create company", "Create a HubSpot company", "WRITE", "hubspot", "hubspot_company_create"));
          if (/\bcreate\b.*\bticket\b|\bticket\b.*\bcreate\b/.test(p)) actions.push(action("hubspot.createTicket", "Create ticket", "Create a HubSpot ticket", "WRITE", "hubspot", "hubspot_ticket_create"));
        }
        break;
      }

      // ── Discord ──
      case "discord": {
        if (/\bconnections?\b/.test(p)) {
          actions.push(action("discord.listConnections", "List connections", "List Discord connections", "READ", "discord", "discord_connections_list"));
        } else {
          actions.push(action("discord.listGuilds", "List servers", "List Discord servers", "READ", "discord", "discord_guilds_list"));
        }
        break;
      }

      // ── ClickUp ──
      case "clickup": {
        if (/\bspaces?\b/.test(p)) {
          actions.push(action("clickup.listSpaces", "List spaces", "List ClickUp spaces", "READ", "clickup", "clickup_spaces_list"));
        } else if (/\blists?\b/.test(p)) {
          actions.push(action("clickup.listLists", "List lists", "List ClickUp lists", "READ", "clickup", "clickup_lists_list"));
        } else if (/\bteams?\b|\bworkspaces?\b/.test(p)) {
          actions.push(action("clickup.listTeams", "List teams", "List ClickUp teams", "READ", "clickup", "clickup_teams_list"));
        } else {
          actions.push(action("clickup.listTasks", "List tasks", "List ClickUp tasks", "READ", "clickup", "clickup_tasks_list"));
        }
        if (wantWrite) {
          if (/\bcreate|add\b/.test(p)) actions.push(action("clickup.createTask", "Create task", "Create a ClickUp task", "WRITE", "clickup", "clickup_task_create"));
          if (/\bupdate\b/.test(p)) actions.push(action("clickup.updateTask", "Update task", "Update a ClickUp task", "MUTATE", "clickup", "clickup_task_update"));
        }
        break;
      }

      // ── Salesforce ──
      case "salesforce": {
        actions.push(action("salesforce.queryRecords", "Query records", "Query Salesforce records", "READ", "salesforce", "salesforce_records_query"));
        if (wantWrite) {
          if (/\bcreate|add\b/.test(p)) actions.push(action("salesforce.createRecord", "Create record", "Create a Salesforce record", "WRITE", "salesforce", "salesforce_record_create"));
          if (/\bupdate\b/.test(p)) actions.push(action("salesforce.updateRecord", "Update record", "Update a Salesforce record", "MUTATE", "salesforce", "salesforce_record_update"));
        }
        break;
      }

      // ── Zendesk ──
      case "zendesk": {
        actions.push(action("zendesk.listTickets", "List tickets", "List Zendesk tickets", "READ", "zendesk", "zendesk_tickets_list"));
        if (wantWrite) {
          if (/\bcreate|add\b/.test(p)) actions.push(action("zendesk.createTicket", "Create ticket", "Create a Zendesk ticket", "WRITE", "zendesk", "zendesk_ticket_create"));
          if (/\bupdate|close\b/.test(p)) actions.push(action("zendesk.updateTicket", "Update ticket", "Update a Zendesk ticket", "MUTATE", "zendesk", "zendesk_ticket_update"));
        }
        break;
      }

      // ── Jira ──
      case "jira": {
        if (/\bsearch\b/.test(p)) {
          actions.push(action("jira.searchIssues", "Search issues", "Search Jira issues", "READ", "jira", "jira_issues_search"));
        } else {
          actions.push(action("jira.searchIssues", "Search issues", "Search Jira issues", "READ", "jira", "jira_issues_search"));
        }
        if (wantWrite) {
          if (/\bcreate|add\b/.test(p)) actions.push(action("jira.createIssue", "Create issue", "Create a Jira issue", "WRITE", "jira", "jira_issue_create"));
          if (/\bupdate\b/.test(p)) actions.push(action("jira.updateIssue", "Update issue", "Update a Jira issue", "MUTATE", "jira", "jira_issue_update"));
          if (/\btransition|move|close\b/.test(p)) actions.push(action("jira.transitionIssue", "Transition issue", "Transition a Jira issue", "MUTATE", "jira", "jira_issue_transition"));
        }
        break;
      }

      // ── QuickBooks ──
      case "quickbooks": {
        if (/\bcustomers?\b/.test(p)) {
          actions.push(action("quickbooks.readCustomers", "Read customers", "Read QuickBooks customers", "READ", "quickbooks", "quickbooks_customers_read"));
        } else if (/\bvendors?\b/.test(p)) {
          actions.push(action("quickbooks.readVendors", "Read vendors", "Read QuickBooks vendors", "READ", "quickbooks", "quickbooks_vendors_read"));
        } else if (/\bbalance\b/.test(p)) {
          actions.push(action("quickbooks.balanceReport", "Balance report", "QuickBooks balance report", "READ", "quickbooks", "quickbooks_balance_report"));
        } else {
          actions.push(action("quickbooks.queryAccounts", "Query accounts", "Query QuickBooks accounts", "READ", "quickbooks", "quickbooks_accounts_query"));
        }
        break;
      }

      // ── Google Analytics ──
      case "google_analytics": {
        if (/\baudiences?\b/.test(p)) {
          actions.push(action("ga.listAudiences", "List audiences", "List Google Analytics audiences", "READ", "google_analytics", "google_analytics_audiences_list"));
        } else {
          actions.push(action("ga.listAccounts", "List accounts", "List Google Analytics accounts", "READ", "google_analytics", "google_analytics_accounts_list"));
        }
        break;
      }

      // ── Fallback for any unknown integration ──
      default: {
        actions.push(action(
          `${integration}.list`,
          `List ${integration} data`,
          `List data from ${integration}`,
          "READ",
          integration,
          `${integration}_list`,
        ));
        break;
      }
    }

    return actions;
  });

  // Hard cap on fallback actions — prevent cascading over-generation
  return allActions.slice(0, MAX_ACTIONS);
}
