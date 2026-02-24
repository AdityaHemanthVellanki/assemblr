import type { UseCaseDefinition } from "../categories";
import { buildSpec } from "../build-spec";
import { makeNotionPageEntity, makeAirtableRecordEntity, makeAsanaTaskEntity, makeOutlookEventEntity, makeOutlookContactEntity, makeZoomMeetingEntity } from "../entity-builders";
import { makeNotionPagesSearchAction, makeNotionDatabasesQueryAction, makeAirtableRecordsListAction, makeAsanaTasksListAction, makeOutlookEventsListAction, makeOutlookContactsListAction, makeZoomMeetingsListAction } from "../action-builders";

export const hrUseCases: UseCaseDefinition[] = [
  // 35. Headcount Tracker
  {
    id: "hr-headcount-tracker",
    name: "Headcount Tracker",
    description: "Track team headcount, department distribution, and hiring progress from Notion and Airtable.",
    category: "HR",
    integrations: ["notion", "airtable"],
    trigger: "Prompt-based",
    output: "Summary",
    prompt: "Show me current headcount by department and recent hires.",
    spec: buildSpec({
      id: "hr-headcount-tracker",
      name: "Headcount Tracker",
      description: "Team headcount and distribution tracking.",
      purpose: "Monitor org growth and department staffing levels.",
      integrations: ["notion", "airtable"],
      entities: [makeNotionPageEntity(), makeAirtableRecordEntity()],
      actions: [makeNotionPagesSearchAction(), makeAirtableRecordsListAction()],
      views: [
        { id: "headcount-dashboard", name: "Headcount Overview", type: "dashboard", source: { entity: "AirtableRecord", statePath: "airtable.records" }, fields: ["id", "createdTime", "fields"], actions: [] },
        { id: "headcount-table", name: "Team Members", type: "table", source: { entity: "AirtableRecord", statePath: "airtable.records" }, fields: ["id", "createdTime", "fields"], actions: ["airtable.records.list"] },
      ],
      query_plans: [
        { integrationId: "notion", actionId: "notion.pages.search", query: {}, fields: ["title", "url", "last_edited_time"], max_results: 50 },
        { integrationId: "airtable", actionId: "airtable.records.list", query: {}, fields: ["id", "createdTime", "fields"], max_results: 50 },
      ],
      answer_contract: { entity_type: "AirtableRecord", required_constraints: [], failure_policy: "empty_over_incorrect", list_shape: "array" },
    }),
  },

  // 36. Onboarding Checklist
  {
    id: "hr-onboarding-checklist",
    name: "Onboarding Checklist",
    description: "Track new hire onboarding progress via Notion pages and Asana tasks.",
    category: "HR",
    integrations: ["notion", "asana"],
    trigger: "Event-based",
    output: "Table",
    prompt: "Show me the onboarding status for all new hires.",
    spec: buildSpec({
      id: "hr-onboarding-checklist",
      name: "Onboarding Checklist",
      description: "New hire onboarding progress tracking.",
      purpose: "Ensure smooth onboarding with task completion visibility.",
      integrations: ["notion", "asana"],
      entities: [makeNotionPageEntity(), makeAsanaTaskEntity()],
      actions: [makeNotionPagesSearchAction(), makeAsanaTasksListAction()],
      views: [
        { id: "onboarding-table", name: "Onboarding Tasks", type: "table", source: { entity: "AsanaTask", statePath: "asana.tasks" }, fields: ["name", "completed", "assignee", "due_on", "projects", "tags", "created_at"], actions: ["asana.tasks.list"] },
        { id: "onboarding-dashboard", name: "Onboarding Progress", type: "dashboard", source: { entity: "AsanaTask", statePath: "asana.tasks" }, fields: ["completed", "assignee", "due_on"], actions: [] },
      ],
      query_plans: [
        { integrationId: "notion", actionId: "notion.pages.search", query: {}, fields: ["title", "url", "last_edited_time"], max_results: 50 },
        { integrationId: "asana", actionId: "asana.tasks.list", query: {}, fields: ["name", "completed", "assignee", "due_on"], max_results: 50 },
      ],
      answer_contract: { entity_type: "AsanaTask", required_constraints: [], failure_policy: "empty_over_incorrect", list_shape: "array" },
    }),
  },

  // 37. Time Off Tracker
  {
    id: "hr-time-off-tracker",
    name: "Time Off Tracker",
    description: "Track PTO requests and time-off records from Airtable and Notion.",
    category: "HR",
    integrations: ["airtable", "notion"],
    trigger: "Prompt-based",
    output: "Table",
    prompt: "Show me all pending and approved time-off requests.",
    spec: buildSpec({
      id: "hr-time-off-tracker",
      name: "Time Off Tracker",
      description: "PTO and time-off management.",
      purpose: "Centralize time-off tracking and availability planning.",
      integrations: ["airtable", "notion"],
      entities: [makeAirtableRecordEntity(), makeNotionPageEntity()],
      actions: [makeAirtableRecordsListAction(), makeNotionPagesSearchAction()],
      views: [
        { id: "pto-table", name: "Time Off Requests", type: "table", source: { entity: "AirtableRecord", statePath: "airtable.records" }, fields: ["id", "createdTime", "fields"], actions: ["airtable.records.list"] },
        { id: "pto-timeline", name: "Time Off Calendar", type: "timeline", source: { entity: "AirtableRecord", statePath: "airtable.records" }, fields: ["id", "createdTime", "fields"], actions: [] },
      ],
      query_plans: [
        { integrationId: "airtable", actionId: "airtable.records.list", query: {}, fields: ["id", "createdTime", "fields"], max_results: 50 },
        { integrationId: "notion", actionId: "notion.pages.search", query: {}, fields: ["title", "url"], max_results: 50 },
      ],
      answer_contract: { entity_type: "AirtableRecord", required_constraints: [], failure_policy: "empty_over_incorrect", list_shape: "array" },
    }),
  },

  // 38. Hiring Pipeline Board
  {
    id: "hr-hiring-pipeline",
    name: "Hiring Pipeline Board",
    description: "Track candidates through hiring stages using Airtable and Notion databases.",
    category: "HR",
    integrations: ["airtable", "notion"],
    trigger: "Prompt-based",
    output: "Table",
    prompt: "Show me the hiring pipeline with candidates in each stage.",
    spec: buildSpec({
      id: "hr-hiring-pipeline",
      name: "Hiring Pipeline Board",
      description: "Candidate pipeline management.",
      purpose: "Track candidate progression and hiring funnel health.",
      integrations: ["airtable", "notion"],
      entities: [makeAirtableRecordEntity(), makeNotionPageEntity()],
      actions: [makeAirtableRecordsListAction(), makeNotionDatabasesQueryAction()],
      views: [
        { id: "candidates-kanban", name: "Hiring Pipeline", type: "kanban", source: { entity: "AirtableRecord", statePath: "airtable.records" }, fields: ["id", "createdTime", "fields"], actions: ["airtable.records.list"] },
        { id: "candidates-table", name: "All Candidates", type: "table", source: { entity: "AirtableRecord", statePath: "airtable.records" }, fields: ["id", "createdTime", "fields"], actions: ["airtable.records.list"] },
      ],
      query_plans: [
        { integrationId: "airtable", actionId: "airtable.records.list", query: {}, fields: ["id", "createdTime", "fields"], max_results: 50 },
        { integrationId: "notion", actionId: "notion.databases.query", query: {}, fields: ["title", "url"], max_results: 50 },
      ],
      answer_contract: { entity_type: "AirtableRecord", required_constraints: [], failure_policy: "empty_over_incorrect", list_shape: "array" },
    }),
  },

  // 39. Performance Review Tracker
  {
    id: "hr-performance-reviews",
    name: "Performance Review Tracker",
    description: "Track performance review cycles and completion status from Notion and Airtable.",
    category: "HR",
    integrations: ["notion", "airtable"],
    trigger: "Time-based",
    output: "Table",
    prompt: "Show me performance review status and completion rates.",
    spec: buildSpec({
      id: "hr-performance-reviews",
      name: "Performance Review Tracker",
      description: "Performance review cycle management.",
      purpose: "Ensure timely completion of review cycles.",
      integrations: ["notion", "airtable"],
      entities: [makeNotionPageEntity(), makeAirtableRecordEntity()],
      actions: [makeNotionDatabasesQueryAction(), makeAirtableRecordsListAction()],
      views: [
        { id: "reviews-table", name: "Review Status", type: "table", source: { entity: "NotionPage", statePath: "notion.pages" }, fields: ["title", "url", "last_edited_time", "created_time", "created_by", "archived"], actions: ["notion.databases.query"] },
        { id: "reviews-dashboard", name: "Completion Metrics", type: "dashboard", source: { entity: "NotionPage", statePath: "notion.pages" }, fields: ["archived", "created_time", "last_edited_time"], actions: [] },
      ],
      query_plans: [
        { integrationId: "notion", actionId: "notion.databases.query", query: {}, fields: ["title", "url", "last_edited_time"], max_results: 50 },
        { integrationId: "airtable", actionId: "airtable.records.list", query: {}, fields: ["id", "fields"], max_results: 50 },
      ],
      answer_contract: { entity_type: "NotionPage", required_constraints: [], failure_policy: "empty_over_incorrect", list_shape: "array" },
    }),
  },

  // 40. Team Directory
  {
    id: "hr-team-directory",
    name: "Team Directory",
    description: "Centralized team directory combining Notion wiki with Outlook contacts.",
    category: "HR",
    integrations: ["notion", "outlook"],
    trigger: "Prompt-based",
    output: "Table",
    prompt: "Show me the team directory with contact information.",
    spec: buildSpec({
      id: "hr-team-directory",
      name: "Team Directory",
      description: "Centralized employee directory.",
      purpose: "Quick lookup of team members and contact details.",
      integrations: ["notion", "outlook"],
      entities: [makeNotionPageEntity(), makeOutlookContactEntity()],
      actions: [makeNotionPagesSearchAction(), makeOutlookContactsListAction()],
      views: [
        { id: "contacts-table", name: "Team Directory", type: "table", source: { entity: "OutlookContact", statePath: "outlook.contacts" }, fields: ["displayName", "emailAddresses", "businessPhones", "companyName", "jobTitle", "department"], actions: ["outlook.contacts.list"] },
        { id: "pages-table", name: "Team Wiki", type: "table", source: { entity: "NotionPage", statePath: "notion.pages" }, fields: ["title", "url", "last_edited_time", "created_by"], actions: ["notion.pages.search"] },
      ],
      query_plans: [
        { integrationId: "notion", actionId: "notion.pages.search", query: {}, fields: ["title", "url", "created_by"], max_results: 50 },
        { integrationId: "outlook", actionId: "outlook.contacts.list", query: {}, fields: ["displayName", "emailAddresses", "companyName"], max_results: 50 },
      ],
      answer_contract: { entity_type: "OutlookContact", required_constraints: [], failure_policy: "empty_over_incorrect", list_shape: "array" },
    }),
  },

  // 41. Meeting Load Analyzer
  {
    id: "hr-meeting-load",
    name: "Meeting Load Analyzer",
    description: "Analyze meeting frequency and duration from Outlook and Zoom to identify overload.",
    category: "HR",
    integrations: ["outlook", "zoom"],
    trigger: "Time-based",
    output: "Summary",
    prompt: "Analyze my meeting load this week from Outlook and Zoom.",
    spec: buildSpec({
      id: "hr-meeting-load",
      name: "Meeting Load Analyzer",
      description: "Meeting frequency and duration analysis.",
      purpose: "Identify meeting overload and protect focus time.",
      integrations: ["outlook", "zoom"],
      entities: [makeOutlookEventEntity(), makeZoomMeetingEntity()],
      actions: [makeOutlookEventsListAction(), makeZoomMeetingsListAction()],
      views: [
        { id: "meetings-dashboard", name: "Meeting Load", type: "dashboard", source: { entity: "OutlookEvent", statePath: "outlook.events" }, fields: ["subject", "start", "end", "isAllDay"], actions: [] },
        { id: "meetings-table", name: "All Meetings", type: "table", source: { entity: "OutlookEvent", statePath: "outlook.events" }, fields: ["subject", "organizer", "start", "end", "location", "attendees", "isOnlineMeeting", "isAllDay"], actions: ["outlook.events.list"] },
      ],
      query_plans: [
        { integrationId: "outlook", actionId: "outlook.events.list", query: {}, fields: ["subject", "start", "end", "organizer"], max_results: 50 },
        { integrationId: "zoom", actionId: "zoom.meetings.list", query: { userId: "me", type: "upcoming" }, fields: ["topic", "start_time", "duration"], max_results: 50 },
      ],
      answer_contract: { entity_type: "OutlookEvent", required_constraints: [], failure_policy: "empty_over_incorrect", list_shape: "array" },
    }),
  },

  // 42. Org Chart Builder
  {
    id: "hr-org-chart-builder",
    name: "Org Chart Builder",
    description: "Build organizational structure views from Notion databases.",
    category: "HR",
    integrations: ["notion"],
    trigger: "Prompt-based",
    output: "Table",
    prompt: "Show me the organizational chart from our Notion team database.",
    spec: buildSpec({
      id: "hr-org-chart-builder",
      name: "Org Chart Builder",
      description: "Organizational structure visualization.",
      purpose: "Understand reporting lines and team structure.",
      integrations: ["notion"],
      entities: [makeNotionPageEntity()],
      actions: [makeNotionPagesSearchAction(), makeNotionDatabasesQueryAction()],
      views: [
        { id: "org-table", name: "Organization", type: "table", source: { entity: "NotionPage", statePath: "notion.pages" }, fields: ["title", "url", "last_edited_time", "created_by", "parent"], actions: ["notion.pages.search"] },
      ],
      query_plans: [{ integrationId: "notion", actionId: "notion.pages.search", query: {}, fields: ["title", "url", "created_by", "parent"], max_results: 50 }],
      answer_contract: { entity_type: "NotionPage", required_constraints: [], failure_policy: "empty_over_incorrect", list_shape: "array" },
    }),
  },
];
