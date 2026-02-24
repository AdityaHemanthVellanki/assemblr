import type { UseCaseDefinition } from "../categories";
import { buildSpec } from "../build-spec";
import { makeHubspotDealEntity, makeHubspotContactEntity, makeHubspotCompanyEntity, makeZoomMeetingEntity, makeIntercomConversationEntity, makeOutlookEmailEntity } from "../entity-builders";
import { makeHubspotDealsListAction, makeHubspotContactsListAction, makeHubspotCompaniesListAction, makeZoomMeetingsListAction, makeIntercomConversationsListAction, makeOutlookMessagesListAction } from "../action-builders";

export const salesUseCases: UseCaseDefinition[] = [
  // 19. Pipeline Overview
  {
    id: "sales-pipeline-overview",
    name: "Pipeline Overview",
    description: "Visualize HubSpot deal pipeline with stage distribution, amounts, and close dates.",
    category: "Sales",
    integrations: ["hubspot"],
    trigger: "Prompt-based",
    output: "Summary",
    prompt: "Show me the current sales pipeline with deal stages and values.",
    spec: buildSpec({
      id: "sales-pipeline-overview",
      name: "Pipeline Overview",
      description: "HubSpot deal pipeline visualization.",
      purpose: "Understand pipeline health and forecast accuracy.",
      integrations: ["hubspot"],
      entities: [makeHubspotDealEntity()],
      actions: [makeHubspotDealsListAction()],
      views: [
        { id: "pipeline-kanban", name: "Deal Pipeline", type: "kanban", source: { entity: "Deal", statePath: "hubspot.deals" }, fields: ["dealname", "dealstage", "amount", "closedate", "pipeline", "hubspot_owner_id"], actions: ["hubspot.deals.list"] },
        { id: "pipeline-dashboard", name: "Pipeline Summary", type: "dashboard", source: { entity: "Deal", statePath: "hubspot.deals" }, fields: ["dealstage", "amount", "pipeline", "hs_deal_stage_probability"], actions: [] },
      ],
      query_plans: [{ integrationId: "hubspot", actionId: "hubspot.deals.list", query: {}, fields: ["dealname", "dealstage", "amount", "closedate"], max_results: 50 }],
      answer_contract: { entity_type: "Deal", required_constraints: [], failure_policy: "empty_over_incorrect", list_shape: "array" },
    }),
  },

  // 20. Deal Velocity Tracker
  {
    id: "sales-deal-velocity",
    name: "Deal Velocity Tracker",
    description: "Track deal movement speed through pipeline stages and identify stuck deals.",
    category: "Sales",
    integrations: ["hubspot"],
    trigger: "Time-based",
    output: "Table",
    prompt: "Show me deal velocity and identify deals stuck in pipeline stages.",
    spec: buildSpec({
      id: "sales-deal-velocity",
      name: "Deal Velocity Tracker",
      description: "Pipeline velocity and bottleneck analysis.",
      purpose: "Identify stuck deals and optimize sales cycle times.",
      integrations: ["hubspot"],
      entities: [makeHubspotDealEntity(), makeHubspotContactEntity()],
      actions: [makeHubspotDealsListAction(), makeHubspotContactsListAction()],
      views: [
        { id: "deals-table", name: "Deal Velocity", type: "table", source: { entity: "Deal", statePath: "hubspot.deals" }, fields: ["dealname", "dealstage", "amount", "closedate", "pipeline", "hubspot_owner_id", "createdate", "hs_lastmodifieddate", "hs_deal_stage_probability"], actions: ["hubspot.deals.list"] },
        { id: "velocity-dashboard", name: "Velocity Metrics", type: "dashboard", source: { entity: "Deal", statePath: "hubspot.deals" }, fields: ["dealstage", "amount", "createdate", "closedate"], actions: [] },
      ],
      query_plans: [
        { integrationId: "hubspot", actionId: "hubspot.deals.list", query: {}, fields: ["dealname", "dealstage", "amount", "createdate", "closedate"], max_results: 50 },
        { integrationId: "hubspot", actionId: "hubspot.contacts.list", query: {}, fields: ["firstname", "lastname", "email", "company"], max_results: 50 },
      ],
      answer_contract: { entity_type: "Deal", required_constraints: [], failure_policy: "empty_over_incorrect", list_shape: "array" },
    }),
  },

  // 21. Lost Deals Analysis
  {
    id: "sales-lost-deals-analysis",
    name: "Lost Deals Analysis",
    description: "Analyze closed-lost deals to identify patterns and improve win rates.",
    category: "Sales",
    integrations: ["hubspot"],
    trigger: "Prompt-based",
    output: "Table",
    prompt: "Show me all lost deals with reasons and patterns.",
    spec: buildSpec({
      id: "sales-lost-deals-analysis",
      name: "Lost Deals Analysis",
      description: "Closed-lost deal pattern analysis.",
      purpose: "Learn from lost deals to improve win rates.",
      integrations: ["hubspot"],
      entities: [makeHubspotDealEntity()],
      actions: [makeHubspotDealsListAction()],
      views: [
        { id: "lost-table", name: "Lost Deals", type: "table", source: { entity: "Deal", statePath: "hubspot.deals" }, fields: ["dealname", "dealstage", "amount", "closedate", "pipeline", "hubspot_owner_id", "createdate", "num_associated_contacts"], actions: ["hubspot.deals.list"] },
        { id: "lost-dashboard", name: "Loss Patterns", type: "dashboard", source: { entity: "Deal", statePath: "hubspot.deals" }, fields: ["dealstage", "amount", "pipeline", "hubspot_owner_id"], actions: [] },
      ],
      query_plans: [{ integrationId: "hubspot", actionId: "hubspot.deals.list", query: {}, fields: ["dealname", "dealstage", "amount", "closedate", "pipeline"], max_results: 50 }],
      answer_contract: { entity_type: "Deal", required_constraints: [], failure_policy: "empty_over_incorrect", list_shape: "array" },
    }),
  },

  // 22. Contact Activity Dashboard
  {
    id: "sales-contact-activity",
    name: "Contact Activity Dashboard",
    description: "Track contact engagement, lifecycle stages, and company associations.",
    category: "Sales",
    integrations: ["hubspot"],
    trigger: "Prompt-based",
    output: "Table",
    prompt: "Show me contact activity with lifecycle stages and company details.",
    spec: buildSpec({
      id: "sales-contact-activity",
      name: "Contact Activity Dashboard",
      description: "Contact engagement and lifecycle tracking.",
      purpose: "Understand contact progression and engagement levels.",
      integrations: ["hubspot"],
      entities: [makeHubspotContactEntity(), makeHubspotCompanyEntity()],
      actions: [makeHubspotContactsListAction(), makeHubspotCompaniesListAction()],
      views: [
        { id: "contacts-table", name: "Contacts", type: "table", source: { entity: "HubspotContact", statePath: "hubspot.contacts" }, fields: ["firstname", "lastname", "email", "phone", "company", "jobtitle", "lifecyclestage", "hs_lead_status", "createdate", "lastmodifieddate"], actions: ["hubspot.contacts.list"] },
        { id: "contacts-dashboard", name: "Contact Metrics", type: "dashboard", source: { entity: "HubspotContact", statePath: "hubspot.contacts" }, fields: ["lifecyclestage", "hs_lead_status", "company"], actions: [] },
      ],
      query_plans: [
        { integrationId: "hubspot", actionId: "hubspot.contacts.list", query: {}, fields: ["firstname", "lastname", "email", "lifecyclestage"], max_results: 50 },
        { integrationId: "hubspot", actionId: "hubspot.companies.list", query: {}, fields: ["name", "domain", "industry"], max_results: 50 },
      ],
      answer_contract: { entity_type: "HubspotContact", required_constraints: [], failure_policy: "empty_over_incorrect", list_shape: "array" },
    }),
  },

  // 23. Meeting-to-Close Tracker
  {
    id: "sales-meeting-pipeline",
    name: "Meeting-to-Close Tracker",
    description: "Correlate Zoom meetings with HubSpot deal progression to measure meeting effectiveness.",
    category: "Sales",
    integrations: ["hubspot", "zoom"],
    trigger: "Prompt-based",
    output: "Table",
    prompt: "Show me upcoming meetings alongside deal status from HubSpot.",
    spec: buildSpec({
      id: "sales-meeting-pipeline",
      name: "Meeting-to-Close Tracker",
      description: "Correlate meetings with deal progression.",
      purpose: "Measure how meetings drive deal advancement.",
      integrations: ["hubspot", "zoom"],
      entities: [makeHubspotDealEntity(), makeZoomMeetingEntity()],
      actions: [makeHubspotDealsListAction(), makeZoomMeetingsListAction()],
      views: [
        { id: "meetings-table", name: "Upcoming Meetings", type: "table", source: { entity: "Meeting", statePath: "zoom.meetings" }, fields: ["topic", "start_time", "duration", "status", "join_url", "agenda"], actions: ["zoom.meetings.list"] },
        { id: "deals-table", name: "Active Deals", type: "table", source: { entity: "Deal", statePath: "hubspot.deals" }, fields: ["dealname", "dealstage", "amount", "closedate", "hubspot_owner_id"], actions: ["hubspot.deals.list"] },
      ],
      query_plans: [
        { integrationId: "hubspot", actionId: "hubspot.deals.list", query: {}, fields: ["dealname", "dealstage", "amount", "closedate"], max_results: 50 },
        { integrationId: "zoom", actionId: "zoom.meetings.list", query: { userId: "me", type: "upcoming" }, fields: ["topic", "start_time", "duration", "status"], max_results: 50 },
      ],
      answer_contract: { entity_type: "Deal", required_constraints: [], failure_policy: "empty_over_incorrect", list_shape: "array" },
    }),
  },

  // 24. Account Health Score
  {
    id: "sales-account-health",
    name: "Account Health Score",
    description: "Combine HubSpot company data with Intercom support conversations to score account health.",
    category: "Sales",
    integrations: ["hubspot", "intercom"],
    trigger: "Prompt-based",
    output: "Summary",
    prompt: "Show me account health scores based on company data and support interactions.",
    spec: buildSpec({
      id: "sales-account-health",
      name: "Account Health Score",
      description: "Multi-signal account health assessment.",
      purpose: "Identify at-risk accounts before churn occurs.",
      integrations: ["hubspot", "intercom"],
      entities: [makeHubspotCompanyEntity(), makeIntercomConversationEntity()],
      actions: [makeHubspotCompaniesListAction(), makeIntercomConversationsListAction()],
      views: [
        { id: "companies-table", name: "Account Health", type: "table", source: { entity: "HubspotCompany", statePath: "hubspot.companies" }, fields: ["name", "domain", "industry", "numberofemployees", "annualrevenue", "lifecyclestage", "city", "country"], actions: ["hubspot.companies.list"] },
        { id: "health-dashboard", name: "Health Overview", type: "dashboard", source: { entity: "HubspotCompany", statePath: "hubspot.companies" }, fields: ["industry", "annualrevenue", "lifecyclestage"], actions: [] },
      ],
      query_plans: [
        { integrationId: "hubspot", actionId: "hubspot.companies.list", query: {}, fields: ["name", "industry", "annualrevenue", "lifecyclestage"], max_results: 50 },
        { integrationId: "intercom", actionId: "intercom.conversations.list", query: { per_page: 50 }, fields: ["state", "subject", "priority"], max_results: 50 },
      ],
      answer_contract: { entity_type: "HubspotCompany", required_constraints: [], failure_policy: "empty_over_incorrect", list_shape: "array" },
    }),
  },

  // 25. Outreach Status Board
  {
    id: "sales-outreach-status",
    name: "Outreach Status Board",
    description: "Track sales outreach via Outlook emails alongside HubSpot contact context.",
    category: "Sales",
    integrations: ["hubspot", "outlook"],
    trigger: "Prompt-based",
    output: "Table",
    prompt: "Show me recent outreach emails and associated contact details.",
    spec: buildSpec({
      id: "sales-outreach-status",
      name: "Outreach Status Board",
      description: "Email outreach tracking with CRM context.",
      purpose: "Monitor outreach cadence and response rates.",
      integrations: ["hubspot", "outlook"],
      entities: [makeHubspotContactEntity(), makeOutlookEmailEntity()],
      actions: [makeHubspotContactsListAction(), makeOutlookMessagesListAction()],
      views: [
        { id: "emails-table", name: "Recent Outreach", type: "table", source: { entity: "Email", statePath: "outlook.messages" }, fields: ["subject", "from", "toRecipients", "receivedDateTime", "isRead", "importance", "bodyPreview"], actions: ["outlook.messages.list"] },
        { id: "contacts-table", name: "Contact Pipeline", type: "table", source: { entity: "HubspotContact", statePath: "hubspot.contacts" }, fields: ["firstname", "lastname", "email", "company", "lifecyclestage", "hs_lead_status"], actions: ["hubspot.contacts.list"] },
      ],
      query_plans: [
        { integrationId: "hubspot", actionId: "hubspot.contacts.list", query: {}, fields: ["firstname", "lastname", "email", "lifecyclestage"], max_results: 50 },
        { integrationId: "outlook", actionId: "outlook.messages.list", query: {}, fields: ["subject", "from", "receivedDateTime", "isRead"], max_results: 50 },
      ],
      answer_contract: { entity_type: "HubspotContact", required_constraints: [], failure_policy: "empty_over_incorrect", list_shape: "array" },
    }),
  },

  // 26. Quota Attainment Tracker
  {
    id: "sales-quota-tracker",
    name: "Quota Attainment Tracker",
    description: "Track deal amounts by owner to measure quota attainment and team performance.",
    category: "Sales",
    integrations: ["hubspot"],
    trigger: "Time-based",
    output: "Summary",
    prompt: "Show me quota attainment by sales rep from HubSpot deals.",
    spec: buildSpec({
      id: "sales-quota-tracker",
      name: "Quota Attainment Tracker",
      description: "Sales rep performance and quota tracking.",
      purpose: "Measure individual and team quota attainment.",
      integrations: ["hubspot"],
      entities: [makeHubspotDealEntity()],
      actions: [makeHubspotDealsListAction()],
      views: [
        { id: "quota-dashboard", name: "Quota Dashboard", type: "dashboard", source: { entity: "Deal", statePath: "hubspot.deals" }, fields: ["hubspot_owner_id", "amount", "dealstage", "closedate"], actions: [] },
        { id: "quota-table", name: "Deal Details", type: "table", source: { entity: "Deal", statePath: "hubspot.deals" }, fields: ["dealname", "dealstage", "amount", "closedate", "hubspot_owner_id", "pipeline", "hs_deal_stage_probability"], actions: ["hubspot.deals.list"] },
      ],
      query_plans: [{ integrationId: "hubspot", actionId: "hubspot.deals.list", query: {}, fields: ["dealname", "dealstage", "amount", "hubspot_owner_id", "closedate"], max_results: 50 }],
      answer_contract: { entity_type: "Deal", required_constraints: [], failure_policy: "empty_over_incorrect", list_shape: "array" },
    }),
  },
];
