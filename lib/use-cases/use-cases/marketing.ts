import type { UseCaseDefinition } from "../categories";
import { buildSpec } from "../build-spec";
import { makeGAAccountEntity, makeHubspotDealEntity, makeHubspotContactEntity, makeNotionPageEntity, makeTrelloBoardEntity, makeTrelloCardEntity, makeAsanaTaskEntity, makeAsanaProjectEntity, makeAirtableRecordEntity } from "../entity-builders";
import { makeGAAccountsListAction, makeGAAudiencesListAction, makeHubspotDealsListAction, makeHubspotContactsListAction, makeNotionPagesSearchAction, makeNotionDatabasesQueryAction, makeTrelloBoardsListAction, makeTrelloCardsListAction, makeAsanaTasksListAction, makeAsanaProjectsListAction, makeAirtableRecordsListAction } from "../action-builders";

export const marketingUseCases: UseCaseDefinition[] = [
  // 27. Web Analytics Overview
  {
    id: "mkt-analytics-overview",
    name: "Web Analytics Overview",
    description: "View Google Analytics accounts and audience insights for marketing performance.",
    category: "Marketing",
    integrations: ["google_analytics"],
    trigger: "Prompt-based",
    output: "Summary",
    prompt: "Show me our web analytics overview with audience data.",
    spec: buildSpec({
      id: "mkt-analytics-overview",
      name: "Web Analytics Overview",
      description: "Google Analytics account and audience overview.",
      purpose: "Monitor web traffic and audience characteristics.",
      integrations: ["google_analytics"],
      entities: [makeGAAccountEntity()],
      actions: [makeGAAccountsListAction(), makeGAAudiencesListAction()],
      views: [
        { id: "ga-table", name: "Analytics Accounts", type: "table", source: { entity: "GAAccount", statePath: "google_analytics.accounts" }, fields: ["name", "displayName", "createTime", "updateTime"], actions: ["google_analytics.accounts.list"] },
        { id: "ga-dashboard", name: "Analytics Overview", type: "dashboard", source: { entity: "GAAccount", statePath: "google_analytics.accounts" }, fields: ["displayName", "createTime"], actions: [] },
      ],
      query_plans: [{ integrationId: "google_analytics", actionId: "google_analytics.accounts.list", query: {}, fields: ["name", "displayName", "createTime"], max_results: 50 }],
      answer_contract: { entity_type: "GAAccount", required_constraints: [], failure_policy: "empty_over_incorrect", list_shape: "array" },
    }),
  },

  // 28. Campaign Tracker
  {
    id: "mkt-campaign-tracker",
    name: "Campaign Tracker",
    description: "Track marketing campaigns using HubSpot deal data and Notion planning docs.",
    category: "Marketing",
    integrations: ["hubspot", "notion"],
    trigger: "Prompt-based",
    output: "Table",
    prompt: "Show me all active marketing campaigns with their status and performance.",
    spec: buildSpec({
      id: "mkt-campaign-tracker",
      name: "Campaign Tracker",
      description: "Marketing campaign tracking across tools.",
      purpose: "Monitor campaign execution and results.",
      integrations: ["hubspot", "notion"],
      entities: [makeHubspotDealEntity(), makeNotionPageEntity()],
      actions: [makeHubspotDealsListAction(), makeNotionPagesSearchAction()],
      views: [
        { id: "campaigns-table", name: "Campaigns", type: "table", source: { entity: "NotionPage", statePath: "notion.pages" }, fields: ["title", "url", "last_edited_time", "created_time", "created_by", "archived"], actions: ["notion.pages.search"] },
        { id: "campaign-dashboard", name: "Campaign Metrics", type: "dashboard", source: { entity: "Deal", statePath: "hubspot.deals" }, fields: ["dealstage", "amount", "pipeline"], actions: [] },
      ],
      query_plans: [
        { integrationId: "hubspot", actionId: "hubspot.deals.list", query: {}, fields: ["dealname", "dealstage", "amount"], max_results: 50 },
        { integrationId: "notion", actionId: "notion.pages.search", query: {}, fields: ["title", "url", "last_edited_time"], max_results: 50 },
      ],
      answer_contract: { entity_type: "NotionPage", required_constraints: [], failure_policy: "empty_over_incorrect", list_shape: "array" },
    }),
  },

  // 29. Content Calendar
  {
    id: "mkt-content-calendar",
    name: "Content Calendar",
    description: "Manage content schedule with Notion pages and Airtable records.",
    category: "Marketing",
    integrations: ["notion", "airtable"],
    trigger: "Prompt-based",
    output: "Table",
    prompt: "Show me the content calendar with all planned and published content.",
    spec: buildSpec({
      id: "mkt-content-calendar",
      name: "Content Calendar",
      description: "Content planning and publishing schedule.",
      purpose: "Coordinate content production and publishing cadence.",
      integrations: ["notion", "airtable"],
      entities: [makeNotionPageEntity(), makeAirtableRecordEntity()],
      actions: [makeNotionPagesSearchAction(), makeAirtableRecordsListAction()],
      views: [
        { id: "content-table", name: "Content Items", type: "table", source: { entity: "NotionPage", statePath: "notion.pages" }, fields: ["title", "url", "last_edited_time", "created_time", "created_by", "archived", "parent"], actions: ["notion.pages.search"] },
        { id: "content-timeline", name: "Publishing Timeline", type: "timeline", source: { entity: "NotionPage", statePath: "notion.pages" }, fields: ["title", "created_time", "last_edited_time"], actions: [] },
      ],
      query_plans: [
        { integrationId: "notion", actionId: "notion.pages.search", query: {}, fields: ["title", "url", "last_edited_time"], max_results: 50 },
        { integrationId: "airtable", actionId: "airtable.records.list", query: {}, fields: ["id", "createdTime", "fields"], max_results: 50 },
      ],
      answer_contract: { entity_type: "NotionPage", required_constraints: [], failure_policy: "empty_over_incorrect", list_shape: "array" },
    }),
  },

  // 30. Audience & Engagement Report
  {
    id: "mkt-social-engagement",
    name: "Audience & Engagement Report",
    description: "View Google Analytics audience data and engagement metrics.",
    category: "Marketing",
    integrations: ["google_analytics"],
    trigger: "Time-based",
    output: "Summary",
    prompt: "Show me audience engagement metrics and trends.",
    spec: buildSpec({
      id: "mkt-social-engagement",
      name: "Audience & Engagement Report",
      description: "Audience engagement analytics.",
      purpose: "Measure audience growth and engagement trends.",
      integrations: ["google_analytics"],
      entities: [makeGAAccountEntity()],
      actions: [makeGAAccountsListAction(), makeGAAudiencesListAction()],
      views: [
        { id: "engagement-dashboard", name: "Engagement Overview", type: "dashboard", source: { entity: "GAAccount", statePath: "google_analytics.accounts" }, fields: ["displayName", "createTime", "updateTime"], actions: [] },
        { id: "accounts-table", name: "Analytics Accounts", type: "table", source: { entity: "GAAccount", statePath: "google_analytics.accounts" }, fields: ["name", "displayName", "createTime", "updateTime"], actions: ["google_analytics.accounts.list"] },
      ],
      query_plans: [{ integrationId: "google_analytics", actionId: "google_analytics.accounts.list", query: {}, fields: ["name", "displayName"], max_results: 50 }],
      answer_contract: { entity_type: "GAAccount", required_constraints: [], failure_policy: "empty_over_incorrect", list_shape: "array" },
    }),
  },

  // 31. Lead Funnel Dashboard
  {
    id: "mkt-lead-funnel",
    name: "Lead Funnel Dashboard",
    description: "Visualize lead progression through lifecycle stages from HubSpot.",
    category: "Marketing",
    integrations: ["hubspot"],
    trigger: "Time-based",
    output: "Summary",
    prompt: "Show me the lead funnel with conversion rates between stages.",
    spec: buildSpec({
      id: "mkt-lead-funnel",
      name: "Lead Funnel Dashboard",
      description: "Lead lifecycle and conversion tracking.",
      purpose: "Measure lead quality and funnel conversion rates.",
      integrations: ["hubspot"],
      entities: [makeHubspotContactEntity(), makeHubspotDealEntity()],
      actions: [makeHubspotContactsListAction(), makeHubspotDealsListAction()],
      views: [
        { id: "funnel-dashboard", name: "Lead Funnel", type: "dashboard", source: { entity: "HubspotContact", statePath: "hubspot.contacts" }, fields: ["lifecyclestage", "hs_lead_status", "company", "createdate"], actions: [] },
        { id: "leads-table", name: "All Leads", type: "table", source: { entity: "HubspotContact", statePath: "hubspot.contacts" }, fields: ["firstname", "lastname", "email", "company", "lifecyclestage", "hs_lead_status", "createdate", "lastmodifieddate"], actions: ["hubspot.contacts.list"] },
      ],
      query_plans: [
        { integrationId: "hubspot", actionId: "hubspot.contacts.list", query: {}, fields: ["firstname", "lastname", "lifecyclestage", "hs_lead_status"], max_results: 50 },
        { integrationId: "hubspot", actionId: "hubspot.deals.list", query: {}, fields: ["dealname", "dealstage", "amount"], max_results: 50 },
      ],
      answer_contract: { entity_type: "HubspotContact", required_constraints: [], failure_policy: "empty_over_incorrect", list_shape: "array" },
    }),
  },

  // 32. Marketing Sprint Board
  {
    id: "mkt-trello-sprint",
    name: "Marketing Sprint Board",
    description: "Track marketing team tasks and sprints using Trello boards and cards.",
    category: "Marketing",
    integrations: ["trello"],
    trigger: "Prompt-based",
    output: "Table",
    prompt: "Show me the marketing sprint board with all task cards.",
    spec: buildSpec({
      id: "mkt-trello-sprint",
      name: "Marketing Sprint Board",
      description: "Trello-based marketing sprint tracking.",
      purpose: "Manage marketing team workload and sprint progress.",
      integrations: ["trello"],
      entities: [makeTrelloBoardEntity(), makeTrelloCardEntity()],
      actions: [makeTrelloBoardsListAction(), makeTrelloCardsListAction()],
      views: [
        { id: "cards-kanban", name: "Sprint Board", type: "kanban", source: { entity: "TrelloCard", statePath: "trello.cards" }, fields: ["name", "desc", "due", "dueComplete", "labels", "members", "dateLastActivity"], actions: ["trello.cards.list"] },
        { id: "cards-table", name: "All Cards", type: "table", source: { entity: "TrelloCard", statePath: "trello.cards" }, fields: ["name", "due", "dueComplete", "labels", "members", "dateLastActivity", "closed", "url"], actions: ["trello.cards.list"] },
      ],
      query_plans: [
        { integrationId: "trello", actionId: "trello.boards.list", query: { idMember: "me" }, fields: ["name", "url"], max_results: 50 },
        { integrationId: "trello", actionId: "trello.cards.list", query: {}, fields: ["name", "due", "labels", "members"], max_results: 50 },
      ],
      answer_contract: { entity_type: "TrelloCard", required_constraints: [], failure_policy: "empty_over_incorrect", list_shape: "array" },
    }),
  },

  // 33. Campaign Project Tracker
  {
    id: "mkt-asana-campaign",
    name: "Campaign Project Tracker",
    description: "Track marketing campaign projects and tasks in Asana.",
    category: "Marketing",
    integrations: ["asana"],
    trigger: "Prompt-based",
    output: "Table",
    prompt: "Show me all marketing campaign projects and their tasks from Asana.",
    spec: buildSpec({
      id: "mkt-asana-campaign",
      name: "Campaign Project Tracker",
      description: "Asana-based campaign project management.",
      purpose: "Track campaign project milestones and task completion.",
      integrations: ["asana"],
      entities: [makeAsanaProjectEntity(), makeAsanaTaskEntity()],
      actions: [makeAsanaProjectsListAction(), makeAsanaTasksListAction()],
      views: [
        { id: "tasks-table", name: "Campaign Tasks", type: "table", source: { entity: "AsanaTask", statePath: "asana.tasks" }, fields: ["name", "completed", "assignee", "due_on", "projects", "tags", "created_at", "modified_at"], actions: ["asana.tasks.list"] },
        { id: "projects-table", name: "Campaign Projects", type: "table", source: { entity: "AsanaProject", statePath: "asana.projects" }, fields: ["name", "owner", "due_date", "start_on", "status", "archived"], actions: ["asana.projects.list"] },
      ],
      query_plans: [
        { integrationId: "asana", actionId: "asana.projects.list", query: {}, fields: ["name", "owner", "due_date", "status"], max_results: 50 },
        { integrationId: "asana", actionId: "asana.tasks.list", query: {}, fields: ["name", "completed", "assignee", "due_on"], max_results: 50 },
      ],
      answer_contract: { entity_type: "AsanaTask", required_constraints: [], failure_policy: "empty_over_incorrect", list_shape: "array" },
    }),
  },

  // 34. Marketing Knowledge Base
  {
    id: "mkt-notion-wiki",
    name: "Marketing Knowledge Base",
    description: "Browse and search marketing documentation and playbooks in Notion.",
    category: "Marketing",
    integrations: ["notion"],
    trigger: "Prompt-based",
    output: "Table",
    prompt: "Show me all marketing documentation and playbooks from Notion.",
    spec: buildSpec({
      id: "mkt-notion-wiki",
      name: "Marketing Knowledge Base",
      description: "Notion-based marketing documentation hub.",
      purpose: "Centralize marketing knowledge for team reference.",
      integrations: ["notion"],
      entities: [makeNotionPageEntity()],
      actions: [makeNotionPagesSearchAction(), makeNotionDatabasesQueryAction()],
      views: [
        { id: "pages-table", name: "Documentation", type: "table", source: { entity: "NotionPage", statePath: "notion.pages" }, fields: ["title", "url", "last_edited_time", "created_time", "created_by", "last_edited_by", "archived", "parent"], actions: ["notion.pages.search"] },
      ],
      query_plans: [{ integrationId: "notion", actionId: "notion.pages.search", query: {}, fields: ["title", "url", "last_edited_time", "created_by"], max_results: 50 }],
      answer_contract: { entity_type: "NotionPage", required_constraints: [], failure_policy: "empty_over_incorrect", list_shape: "array" },
    }),
  },
];
