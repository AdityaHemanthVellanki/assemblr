import { createEmptyToolSpec, type IntegrationId, type ToolSystemSpec } from "@/lib/toolos/spec";
import { getCapabilitiesForIntegration } from "@/lib/capabilities/registry";

export type UseCaseCategory =
  | "Engineering & DevOps"
  | "Messaging & Communication"
  | "CRM, Analytics & Support"
  | "Productivity & Project Management"
  | "Payments & Finance"
  | "Assemblr Cross-Integration Power Tools";

export type UseCaseTrigger = "Prompt-based" | "Event-based" | "Time-based";
export type UseCaseOutput = "Table" | "Summary" | "Alert" | "Document";

export type UseCaseDefinition = {
  id: string;
  name: string;
  description: string;
  category: UseCaseCategory;
  integrations: IntegrationId[];
  trigger: UseCaseTrigger;
  output: UseCaseOutput;
  prompt: string;
  spec: ToolSystemSpec;
};

export const useCaseCategories: UseCaseCategory[] = [
  "Engineering & DevOps",
  "Messaging & Communication",
  "CRM, Analytics & Support",
  "Productivity & Project Management",
  "Payments & Finance",
  "Assemblr Cross-Integration Power Tools"
];

const integrationCapabilities = (id: IntegrationId) =>
  getCapabilitiesForIntegration(id).map((cap) => cap.id);

const buildSpec = (input: {
  id: string;
  name: string;
  description: string;
  purpose: string;
  integrations: IntegrationId[];
  entities: ToolSystemSpec["entities"];
  actions: ToolSystemSpec["actions"];
  views: ToolSystemSpec["views"];
  query_plans?: ToolSystemSpec["query_plans"];
  answer_contract?: ToolSystemSpec["answer_contract"];
  goal_plan?: ToolSystemSpec["goal_plan"];
  intent_contract?: ToolSystemSpec["intent_contract"];
  triggers?: ToolSystemSpec["triggers"];
  initialFetch?: ToolSystemSpec["initialFetch"];
  dataReadiness?: ToolSystemSpec["dataReadiness"];
}) => {
  const base = createEmptyToolSpec({
    id: input.id,
    name: input.name,
    purpose: input.purpose,
    description: input.description,
    sourcePrompt: input.purpose,
  });

  return {
    ...base,
    integrations: input.integrations.map((id) => ({
      id,
      capabilities: integrationCapabilities(id),
    })),
    entities: input.entities,
    actions: input.actions,
    views: input.views,
    triggers: input.triggers ?? [],
    query_plans: input.query_plans ?? [],
    answer_contract: input.answer_contract ?? {
      entity_type: "item",
      required_constraints: [],
      failure_policy: "empty_over_incorrect",
      list_shape: "array",
    },
    goal_plan: input.goal_plan ?? {
      kind: "ANALYSIS",
      primary_goal: input.purpose,
      sub_goals: [],
      constraints: [],
      derived_entities: [],
    },
    intent_contract: input.intent_contract ?? {
      userGoal: input.purpose,
      successCriteria: ["Analysis complete"],
      implicitConstraints: [],
      hiddenStateRequirements: [],
      subjectivityScore: 0.35,
      heuristics: [],
      requiredEntities: {
        integrations: input.integrations,
        objects: [],
        filters: [],
      },
      forbiddenOutputs: [],
      acceptableFallbacks: [],
    },
    initialFetch: input.initialFetch,
    dataReadiness: input.dataReadiness ?? { requiredEntities: [], minimumRecords: 1 },
    automations: {
      enabled: true,
      capabilities: {
        canRunWithoutUI: true,
        supportedTriggers: (input.triggers ?? []).map((t) => t.type),
        maxFrequency: 1440,
        safetyConstraints: ["approval_required_for_writes"],
      },
    },
    observability: {
      executionTimeline: true,
      recentRuns: true,
      errorStates: true,
      integrationHealth: true,
      manualRetryControls: true,
    },
  };
};

// --- Common Entities ---
const githubIssue = { name: "Issue", sourceIntegration: "github" as const, identifiers: ["id"], fields: [] };
const githubPR = { name: "PullRequest", sourceIntegration: "github" as const, identifiers: ["id"], fields: [] };
const linearIssue = { name: "Issue", sourceIntegration: "linear" as const, identifiers: ["id"], fields: [] };
const slackMessage = { name: "Message", sourceIntegration: "slack" as const, identifiers: ["id"], fields: [] };
const hubspotDeal = { name: "Deal", sourceIntegration: "hubspot" as const, identifiers: ["id"], fields: [] };
const stripeCharge = { name: "Charge", sourceIntegration: "stripe" as const, identifiers: ["id"], fields: [] };
const intercomTicket = { name: "Ticket", sourceIntegration: "intercom" as const, identifiers: ["id"], fields: [] };
const notionPage = { name: "Page", sourceIntegration: "notion" as const, identifiers: ["id"], fields: [] };
const trelloCard = { name: "Card", sourceIntegration: "trello" as const, identifiers: ["id"], fields: [] };
const zoomMeeting = { name: "Meeting", sourceIntegration: "zoom" as const, identifiers: ["id"], fields: [] };

export const useCases: UseCaseDefinition[] = [
  // =================================================================
  // 🛠 ENGINEERING & DEVOPS
  // =================================================================
  {
    id: "eng-velocity-dashboard",
    name: "Engineering Velocity Dashboard",
    description: "Aggregate PR merge times, commit frequency, issue throughput, and cycle times across GitHub + Linear.",
    category: "Engineering & DevOps",
    integrations: ["github", "linear"],
    trigger: "Prompt-based",
    output: "Table",
    prompt: "Show the engineering velocity for our team over the last 30 days using GitHub and Linear.",
    spec: buildSpec({
      id: "eng-velocity-dashboard",
      name: "Engineering Velocity Dashboard",
      description: "Correlate PR activity with Linear cycle progress.",
      purpose: "Measure and visualize engineering delivery speed.",
      integrations: ["github", "linear"],
      entities: [githubPR, linearIssue],
      actions: [
        { id: "github.prs.list", name: "List PRs", description: "Fetch merged PRs", type: "READ", integrationId: "github", capabilityId: "github_pull_requests_list", inputSchema: {}, outputSchema: {}, writesToState: false },
        { id: "linear.issues.list", name: "List Issues", description: "Fetch completed issues", type: "READ", integrationId: "linear", capabilityId: "linear_issues_list", inputSchema: {}, outputSchema: {}, writesToState: false }
      ],
      views: [{ id: "main-dashboard", name: "Velocity Overview", type: "table", source: { entity: "PullRequest", statePath: "github.prs" }, fields: ["title", "mergedAt"], actions: ["github.prs.list"] }]
    })
  },
  {
    id: "eng-release-ready",
    name: "Release Readiness Checker",
    description: "Check open PRs, failing checks, unresolved Linear issues, and block releases.",
    category: "Engineering & DevOps",
    integrations: ["github", "linear"],
    trigger: "Prompt-based",
    output: "Alert",
    prompt: "Are we ready to release? Verify all critical items in GitHub and Linear.",
    spec: buildSpec({
      id: "eng-release-ready",
      name: "Release Readiness Checker",
      description: "Aggregated release risk assessment.",
      purpose: "Determine if current state meets release criteria.",
      integrations: ["github", "linear"],
      entities: [githubPR, linearIssue],
      actions: [
        { id: "github.checks.list", name: "Check CI", description: "Get status checks", type: "READ", integrationId: "github", capabilityId: "github_checks_list", inputSchema: {}, outputSchema: {}, writesToState: false }
      ],
      views: [{ id: "readiness-view", name: "Readiness Check", type: "summary", source: { entity: "Issue" }, fields: ["status"], actions: [] }]
    })
  },
  {
    id: "eng-incident-tracker",
    name: "On-Call Incident Tracker",
    description: "Combine GitHub issues, Linear incidents, and Slack alerts into a live incident dashboard.",
    category: "Engineering & DevOps",
    integrations: ["github", "linear", "slack"],
    trigger: "Time-based",
    output: "Alert",
    prompt: "Show me all active incidents across GitHub, Linear, and Slack.",
    spec: buildSpec({
      id: "eng-incident-tracker",
      name: "On-Call Incident Tracker",
      description: "Live incident monitoring across platforms.",
      purpose: "Surface active incidents for on-call engineers.",
      integrations: ["github", "linear", "slack"],
      entities: [githubIssue, linearIssue, slackMessage],
      actions: [],
      views: [{ id: "incident-view", name: "Active Incidents", type: "table", source: { entity: "Issue" }, fields: ["title", "status"], actions: [] }]
    })
  },
  {
    id: "eng-pr-risk",
    name: "PR Risk Analyzer",
    description: "Identify PRs with high churn, many reviewers, long review cycles, or force pushes.",
    category: "Engineering & DevOps",
    integrations: ["github"],
    trigger: "Prompt-based",
    output: "Table",
    prompt: "Analyze the risk of current open PRs in GitHub.",
    spec: buildSpec({
      id: "eng-pr-risk",
      name: "PR Risk Analyzer",
      description: "Analyze code review and churn risk.",
      purpose: "Identify dangerous pull requests.",
      integrations: ["github"],
      entities: [githubPR],
      actions: [],
      views: []
    })
  },
  {
    id: "eng-sprint-health",
    name: "Sprint Health Monitor",
    description: "Track sprint progress, spillovers, blocked tasks, and capacity utilization.",
    category: "Engineering & DevOps",
    integrations: ["linear"],
    trigger: "Prompt-based",
    output: "Summary",
    prompt: "Give me a health report of our current Linear sprint.",
    spec: buildSpec({
      id: "eng-sprint-health",
      name: "Sprint Health Monitor",
      description: "Monitor Linear sprint metrics.",
      purpose: "Ensure sprint is on track.",
      integrations: ["linear"],
      entities: [linearIssue],
      actions: [],
      views: []
    })
  },
  {
    id: "eng-bottleneck-detector",
    name: "Engineering Bottleneck Detector",
    description: "Detect reviewers or teams slowing delivery based on PR activity.",
    category: "Engineering & DevOps",
    integrations: ["github"],
    trigger: "Prompt-based",
    output: "Summary",
    prompt: "Who is currently a bottleneck in our PR review process?",
    spec: buildSpec({
      id: "eng-bottleneck-detector",
      name: "Engineering Bottleneck Detector",
      description: "Identify flow constraints in delivery.",
      purpose: "Optimize review cycles.",
      integrations: ["github"],
      entities: [githubPR],
      actions: [],
      views: []
    })
  },
  {
    id: "eng-tech-debt",
    name: "Tech Debt Radar",
    description: "Surface stale issues, long-lived branches, TODO density, and low-touch repos.",
    category: "Engineering & DevOps",
    integrations: ["github", "linear"],
    trigger: "Prompt-based",
    output: "Document",
    prompt: "Generate a tech debt report for our core repositories.",
    spec: buildSpec({
      id: "eng-tech-debt",
      name: "Tech Debt Radar",
      description: "Surface engineering hygiene risks.",
      purpose: "Prioritize maintenance tasks.",
      integrations: ["github", "linear"],
      entities: [githubIssue, linearIssue],
      actions: [],
      views: []
    })
  },
  {
    id: "eng-productivity-scorecard",
    name: "Developer Productivity Scorecard",
    description: "Internal contribution analysis (non-gamified).",
    category: "Engineering & DevOps",
    integrations: ["github", "linear"],
    trigger: "Time-based",
    output: "Document",
    prompt: "Show me a contribution report for the team this month.",
    spec: buildSpec({
      id: "eng-productivity-scorecard",
      name: "Developer Productivity Scorecard",
      description: "Internal team output analysis.",
      purpose: "Track team contribution trends.",
      integrations: ["github", "linear"],
      entities: [githubPR, linearIssue],
      actions: [],
      views: []
    })
  },
  {
    id: "eng-bug-regression",
    name: "Bug Regression Tracker",
    description: "Track reopened issues and link them to recent PRs.",
    category: "Engineering & DevOps",
    integrations: ["github", "linear"],
    trigger: "Event-based",
    output: "Alert",
    prompt: "Are any bugs reopening soon after their fix PR was merged?",
    spec: buildSpec({
      id: "eng-bug-regression",
      name: "Bug Regression Tracker",
      description: "Track bug lifecycles and regressions.",
      purpose: "Improve patch reliability.",
      integrations: ["github", "linear"],
      entities: [githubIssue, githubPR, linearIssue],
      actions: [],
      views: []
    })
  },
  {
    id: "eng-ownership-map",
    name: "Repository Ownership Map",
    description: "Visualize repo owners, contributors, and bus-factor risk.",
    category: "Engineering & DevOps",
    integrations: ["github"],
    trigger: "Prompt-based",
    output: "Table",
    prompt: "Create an ownership map for all our GitHub repositories.",
    spec: buildSpec({
      id: "eng-ownership-map",
      name: "Repository Ownership Map",
      description: "Visualize knowledge distribution.",
      purpose: "Reduce bus factor risk.",
      integrations: ["github"],
      entities: [githubPR],
      actions: [],
      views: []
    })
  },

  // =================================================================
  // 💬 MESSAGING & COMMUNICATION
  // =================================================================
  {
    id: "msg-executive-brief",
    name: "Executive Daily Brief",
    description: "Auto-generate daily Slack/Email briefings across engineering, revenue, and customers.",
    category: "Messaging & Communication",
    integrations: ["slack", "github", "hubspot"],
    trigger: "Time-based",
    output: "Summary",
    prompt: "Summarize the key events from GitHub, HubSpot, and Slack from the last 24 hours.",
    spec: buildSpec({
      id: "msg-executive-brief",
      name: "Executive Daily Brief",
      description: "Unified cross-platform summary.",
      purpose: "Keep leadership informed with minimal noise.",
      integrations: ["slack", "github", "hubspot"],
      entities: [slackMessage, githubPR, hubspotDeal],
      actions: [],
      views: []
    })
  },
  {
    id: "msg-incident-router",
    name: "Incident Alert Router",
    description: "Route critical GitHub / Linear / Intercom alerts to the correct Slack channels.",
    category: "Messaging & Communication",
    integrations: ["slack", "github", "linear", "intercom"],
    trigger: "Event-based",
    output: "Alert",
    prompt: "Monitor for critical issues and route them to #incidents.",
    spec: buildSpec({
      id: "msg-incident-router",
      name: "Incident Alert Router",
      description: "Automated alert routing.",
      purpose: "Ensure critical signals are seen by the right people.",
      integrations: ["slack", "github", "linear", "intercom"],
      entities: [githubIssue, linearIssue, intercomTicket],
      actions: [],
      views: []
    })
  },
  {
    id: "msg-meeting-intel",
    name: "Meeting Intelligence Tool",
    description: "Summarize Outlook meetings + Slack threads into decisions and action items.",
    category: "Messaging & Communication",
    integrations: ["outlook", "slack"],
    trigger: "Event-based",
    output: "Document",
    prompt: "Synthesize my recent meetings and Slack conversations into action items.",
    spec: buildSpec({
      id: "msg-meeting-intel",
      name: "Meeting Intelligence Tool",
      description: "Extract decisions from communication noise.",
      purpose: "Improve meeting accountability.",
      integrations: ["outlook", "slack"],
      entities: [slackMessage],
      actions: [],
      views: []
    })
  },
  {
    id: "msg-sentiment-monitor",
    name: "Team Sentiment Monitor",
    description: "Analyze Slack message tone and volume for burnout signals.",
    category: "Messaging & Communication",
    integrations: ["slack"],
    trigger: "Time-based",
    output: "Summary",
    prompt: "Analyze the sentiment of our main team channels for the last week.",
    spec: buildSpec({
      id: "msg-sentiment-monitor",
      name: "Team Sentiment Monitor",
      description: "Monitor organizational health via chat dynamics.",
      purpose: "Proactively identify team burnout.",
      integrations: ["slack"],
      entities: [slackMessage],
      actions: [],
      views: []
    })
  },
  {
    id: "msg-dependency-notifier",
    name: "Cross-Team Dependency Notifier",
    description: "Notify teams when their work blocks other teams’ Linear issues.",
    category: "Messaging & Communication",
    integrations: ["linear", "slack"],
    trigger: "Event-based",
    output: "Alert",
    prompt: "Notify me in Slack when a Linear issue is blocked.",
    spec: buildSpec({
      id: "msg-dependency-notifier",
      name: "Cross-Team Dependency Notifier",
      description: "Unblock teams automatically.",
      purpose: "Reduce waiting time across teams.",
      integrations: ["linear", "slack"],
      entities: [linearIssue, slackMessage],
      actions: [],
      views: []
    })
  },
  {
    id: "msg-escalation-alarm",
    name: "Customer Escalation Alarm",
    description: "Alert leadership when high-value customers trigger risk conditions.",
    category: "Messaging & Communication",
    integrations: ["intercom", "hubspot", "slack"],
    trigger: "Event-based",
    output: "Alert",
    prompt: "Alert Slack if a major customer opens a high-priority ticket.",
    spec: buildSpec({
      id: "msg-escalation-alarm",
      name: "Customer Escalation Alarm",
      description: "High-value customer monitoring.",
      purpose: "Prevent churn of enterprise accounts.",
      integrations: ["intercom", "hubspot", "slack"],
      entities: [intercomTicket, hubspotDeal, slackMessage],
      actions: [],
      views: []
    })
  },
  {
    id: "msg-async-standup",
    name: "Async Standup Generator",
    description: "Convert Slack updates into structured daily standups.",
    category: "Messaging & Communication",
    integrations: ["slack", "linear"],
    trigger: "Time-based",
    output: "Summary",
    prompt: "Generate an async standup report based on yesterday's Slack activity and Linear updates.",
    spec: buildSpec({
      id: "msg-async-standup",
      name: "Async Standup Generator",
      description: "Automated status reporting.",
      purpose: "Reduce synchronous meeting overhead.",
      integrations: ["slack", "linear"],
      entities: [slackMessage, linearIssue],
      actions: [],
      views: []
    })
  },
  {
    id: "msg-inbox-zero",
    name: "Leadership Inbox Zero Tool",
    description: "Aggregate priority Slack, Outlook, and GitHub messages.",
    category: "Messaging & Communication",
    integrations: ["slack", "outlook", "github"],
    trigger: "Prompt-based",
    output: "Summary",
    prompt: "Show me only the most important messages I need to act on from Slack, Email, and GitHub.",
    spec: buildSpec({
      id: "msg-inbox-zero",
      name: "Leadership Inbox Zero Tool",
      description: "Prioritize communication for high-impact roles.",
      purpose: "Focus attention on critical issues.",
      integrations: ["slack", "outlook", "github"],
      entities: [slackMessage, githubIssue, githubPR],
      actions: [],
      views: []
    })
  },

  // =================================================================
  // 📈 CRM, ANALYTICS & SUPPORT
  // =================================================================
  {
    id: "crm-revenue-risk",
    name: "Revenue Risk Monitor",
    description: "Identify accounts with declining usage, open tickets, and unpaid invoices.",
    category: "CRM, Analytics & Support",
    integrations: ["hubspot", "intercom", "stripe"],
    trigger: "Time-based",
    output: "Table",
    prompt: "Which HubSpot accounts are currently at risk based on tickets and payment status?",
    spec: buildSpec({
      id: "crm-revenue-risk",
      name: "Revenue Risk Monitor",
      description: "Correlate CRM, support, and billing data.",
      purpose: "Identify churn risk before it happens.",
      integrations: ["hubspot", "intercom", "stripe"],
      entities: [hubspotDeal, intercomTicket, stripeCharge],
      actions: [],
      views: []
    })
  },
  {
    id: "crm-sales-intel",
    name: "Sales Pipeline Intelligence Tool",
    description: "Combine HubSpot deals with product usage and support activity.",
    category: "CRM, Analytics & Support",
    integrations: ["hubspot", "google_analytics", "intercom"],
    trigger: "Prompt-based",
    output: "Table",
    prompt: "Provide a detailed intelligence report for my current HubSpot pipeline.",
    spec: buildSpec({
      id: "crm-sales-intel",
      name: "Sales Pipeline Intelligence Tool",
      description: "Enrich pipeline data with usage signals.",
      purpose: "Improve sales close rates.",
      integrations: ["hubspot", "google_analytics", "intercom"],
      entities: [hubspotDeal, intercomTicket],
      actions: [],
      views: []
    })
  },
  {
    id: "crm-churn-warning",
    name: "Churn Early Warning System",
    description: "Detect churn risk using Intercom tickets + usage + billing.",
    category: "CRM, Analytics & Support",
    integrations: ["intercom", "stripe"],
    trigger: "Event-based",
    output: "Alert",
    prompt: "Flag any customers showing symptoms of churn.",
    spec: buildSpec({
      id: "crm-churn-warning",
      name: "Churn Early Warning System",
      description: "Automated churn detection.",
      purpose: "Provide advance notice of customer loss.",
      integrations: ["intercom", "stripe"],
      entities: [intercomTicket, stripeCharge],
      actions: [],
      views: []
    })
  },
  {
    id: "crm-support-forecast",
    name: "Support Load Forecasting Tool",
    description: "Predict support volume from Intercom + Google Analytics trends.",
    category: "CRM, Analytics & Support",
    integrations: ["intercom", "google_analytics"],
    trigger: "Time-based",
    output: "Summary",
    prompt: "Predict next week's support volume based on current traffic and ticket trends.",
    spec: buildSpec({
      id: "crm-support-forecast",
      name: "Support Load Forecasting Tool",
      description: "Anticipate support demand.",
      purpose: "Optimize support team scheduling.",
      integrations: ["intercom", "google_analytics"],
      entities: [intercomTicket],
      actions: [],
      views: []
    })
  },
  {
    id: "crm-health-score",
    name: "Customer Health Scoring Engine",
    description: "Unified health score across CRM, support, usage, and payments.",
    category: "CRM, Analytics & Support",
    integrations: ["hubspot", "intercom", "stripe"],
    trigger: "Time-based",
    output: "Table",
    prompt: "Generate a health score for all enterprise customers.",
    spec: buildSpec({
      id: "crm-health-score",
      name: "Customer Health Scoring Engine",
      description: "Metric weighted customer health.",
      purpose: "Standardize account assessment.",
      integrations: ["hubspot", "intercom", "stripe"],
      entities: [hubspotDeal, intercomTicket, stripeCharge],
      actions: [],
      views: []
    })
  },
  {
    id: "crm-expansion-finder",
    name: "Expansion Opportunity Finder",
    description: "Identify customers with rising usage but low contract value.",
    category: "CRM, Analytics & Support",
    integrations: ["hubspot", "google_analytics"],
    trigger: "Prompt-based",
    output: "Table",
    prompt: "Find expansion opportunities in HubSpot using Google Analytics data.",
    spec: buildSpec({
      id: "crm-expansion-finder",
      name: "Expansion Opportunity Finder",
      description: "Identify upsell potential.",
      purpose: "Maximize account LTV.",
      integrations: ["hubspot", "google_analytics"],
      entities: [hubspotDeal],
      actions: [],
      views: []
    })
  },
  {
    id: "crm-deal-slippage",
    name: "Deal Slippage Detector",
    description: "Detect deals stuck in stages longer than normal.",
    category: "CRM, Analytics & Support",
    integrations: ["hubspot"],
    trigger: "Time-based",
    output: "Alert",
    prompt: "Which HubSpot deals are currently stuck and slipping?",
    spec: buildSpec({
      id: "crm-deal-slippage",
      name: "Deal Slippage Detector",
      description: "Monitor pipeline velocity.",
      purpose: "Alert on sales stagnation.",
      integrations: ["hubspot"],
      entities: [hubspotDeal],
      actions: [],
      views: []
    })
  },
  {
    id: "crm-sla-compliance",
    name: "Support SLA Compliance Dashboard",
    description: "Track response times, escalations, and SLA breaches.",
    category: "CRM, Analytics & Support",
    integrations: ["intercom"],
    trigger: "Time-based",
    output: "Table",
    prompt: "Show me current SLA compliance across all Intercom conversations.",
    spec: buildSpec({
      id: "crm-sla-compliance",
      name: "Support SLA Compliance Dashboard",
      description: "Monitor support quality.",
      purpose: "Ensure support meets contractual obligations.",
      integrations: ["intercom"],
      entities: [intercomTicket],
      actions: [],
      views: []
    })
  },
  {
    id: "crm-executive-revenue",
    name: "Executive Revenue Dashboard",
    description: "One-page ARR, churn, expansion, and cash flow view.",
    category: "CRM, Analytics & Support",
    integrations: ["hubspot", "stripe"],
    trigger: "Time-based",
    output: "Summary",
    prompt: "Generate a revenue health summary for this quarter.",
    spec: buildSpec({
      id: "crm-executive-revenue",
      name: "Executive Revenue Dashboard",
      description: "C-level revenue overview.",
      purpose: "Monitor primary business health.",
      integrations: ["hubspot", "stripe"],
      entities: [hubspotDeal, stripeCharge],
      actions: [],
      views: []
    })
  },

  // =================================================================
  // ⚡ PRODUCTIVITY & PROJECT MANAGEMENT
  // =================================================================
  {
    id: "prod-operating-sys",
    name: "Company Operating System Dashboard",
    description: "Unified OKRs, projects, and execution status.",
    category: "Productivity & Project Management",
    integrations: ["notion", "linear", "trello"],
    trigger: "Time-based",
    output: "Document",
    prompt: "Show me the overall status of the company goals in Notion and tasks in Linear.",
    spec: buildSpec({
      id: "prod-operating-sys",
      name: "Company Operating System",
      description: "Holistic execution monitoring.",
      purpose: "Keep the whole company aligned.",
      integrations: ["notion", "linear", "trello"],
      entities: [notionPage, linearIssue, trelloCard],
      actions: [],
      views: []
    })
  },
  {
    id: "prod-okr-tracker",
    name: "OKR Progress Tracker",
    description: "Auto-update OKRs from task completion and metrics.",
    category: "Productivity & Project Management",
    integrations: ["notion", "linear", "google_analytics"],
    trigger: "Time-based",
    output: "Table",
    prompt: "Update our OKRs in Notion based on Linear progress and GA metrics.",
    spec: buildSpec({
      id: "prod-okr-tracker",
      name: "OKR Progress Tracker",
      description: "Automated goal tracking.",
      purpose: "Reduce manual status reporting.",
      integrations: ["notion", "linear", "google_analytics"],
      entities: [notionPage, linearIssue],
      actions: [],
      views: []
    })
  },
  {
    id: "prod-risk-heatmap",
    name: "Project Risk Heatmap",
    description: "Visualize project risk from delays, blockers, and dependencies.",
    category: "Productivity & Project Management",
    integrations: ["linear", "asana"],
    trigger: "Prompt-based",
    output: "Table",
    prompt: "Generate a risk heatmap for all active projects.",
    spec: buildSpec({
      id: "prod-risk-heatmap",
      name: "Project Risk Heatmap",
      description: "Visualize execution risk.",
      purpose: "Prioritize project interventions.",
      integrations: ["linear", "asana"],
      entities: [linearIssue],
      actions: [],
      views: []
    })
  },
  {
    id: "prod-cross-functional",
    name: "Cross-Functional Planning Tool",
    description: "Align engineering, marketing, and sales timelines.",
    category: "Productivity & Project Management",
    integrations: ["linear", "asana", "hubspot"],
    trigger: "Prompt-based",
    output: "Document",
    prompt: "Align our engineering roadmap with marketing campaigns and sales targets.",
    spec: buildSpec({
      id: "prod-cross-functional",
      name: "Cross-Functional Planning Tool",
      description: "Synchronize departmental activities.",
      purpose: "Ensure unified market launches.",
      integrations: ["linear", "asana", "hubspot"],
      entities: [linearIssue, hubspotDeal],
      actions: [],
      views: []
    })
  },
  {
    id: "prod-decision-log",
    name: "Decision Log System",
    description: "Capture Zoom meetings + Notion notes into structured decisions.",
    category: "Productivity & Project Management",
    integrations: ["zoom", "notion"],
    trigger: "Event-based",
    output: "Document",
    prompt: "Log all final decisions made in recent Zoom meetings to Notion.",
    spec: buildSpec({
      id: "prod-decision-log",
      name: "Decision Log System",
      description: "Historical record of decisions.",
      purpose: "Prevent circular discussions and amnesia.",
      integrations: ["zoom", "notion"],
      entities: [zoomMeeting, notionPage],
      actions: [],
      views: []
    })
  },
  {
    id: "prod-hiring-pipeline",
    name: "Hiring Pipeline Tracker",
    description: "Track interview loops and hiring velocity.",
    category: "Productivity & Project Management",
    integrations: ["notion", "slack"],
    trigger: "Time-based",
    output: "Table",
    prompt: "Provide an update on our current hiring pipeline.",
    spec: buildSpec({
      id: "prod-hiring-pipeline",
      name: "Hiring Pipeline Tracker",
      description: "Monitor recruitment progress.",
      purpose: "Identify hiring bottlenecks.",
      integrations: ["notion", "slack"],
      entities: [notionPage, slackMessage],
      actions: [],
      views: []
    })
  },
  {
    id: "prod-audit-trail",
    name: "Internal Audit Trail",
    description: "Searchable history of decisions, changes, and approvals.",
    category: "Productivity & Project Management",
    integrations: ["notion", "github", "slack"],
    trigger: "Prompt-based",
    output: "Document",
    prompt: "Search the audit trail for all changes to our core infrastructure this month.",
    spec: buildSpec({
      id: "prod-audit-trail",
      name: "Internal Audit Trail",
      description: "Searchable change history.",
      purpose: "Maintain compliance and accountability.",
      integrations: ["notion", "github", "slack"],
      entities: [notionPage, githubPR, slackMessage],
      actions: [],
      views: []
    })
  },
  {
    id: "prod-task-drift",
    name: "Task Drift Detector",
    description: "Detect tasks moving without progress.",
    category: "Productivity & Project Management",
    integrations: ["linear", "asana", "trello"],
    trigger: "Time-based",
    output: "Alert",
    prompt: "Identify tasks that have been 'In Progress' too long without updates.",
    spec: buildSpec({
      id: "prod-task-drift",
      name: "Task Drift Detector",
      description: "Identify stalled work.",
      purpose: "Prevent project delays early.",
      integrations: ["linear", "asana", "trello"],
      entities: [linearIssue, trelloCard],
      actions: [],
      views: []
    })
  },
  {
    id: "prod-resource-alloc",
    name: "Resource Allocation Optimizer",
    description: "Analyze workload and recommend rebalancing.",
    category: "Productivity & Project Management",
    integrations: ["linear", "asana"],
    trigger: "Time-based",
    output: "Summary",
    prompt: "Is the team's workload balanced correctly? Recommend reassignments if not.",
    spec: buildSpec({
      id: "prod-resource-alloc",
      name: "Resource Allocation Optimizer",
      description: "Equity analyzer for workload.",
      purpose: "Avoid team burnout and idle time.",
      integrations: ["linear", "asana"],
      entities: [linearIssue],
      actions: [],
      views: []
    })
  },

  // =================================================================
  // 💳 PAYMENTS & FINANCE
  // =================================================================
  {
    id: "fin-cash-flow",
    name: "Cash Flow Forecast Tool",
    description: "Combine Stripe subscriptions with QuickBooks expenses.",
    category: "Payments & Finance",
    integrations: ["stripe", "quickbooks"],
    trigger: "Time-based",
    output: "Document",
    prompt: "Forecast our cash flow for the next 90 days.",
    spec: buildSpec({
      id: "fin-cash-flow",
      name: "Cash Flow Forecast Tool",
      description: "Revenue minus expense projection.",
      purpose: "Maintain financial healthy and runway.",
      integrations: ["stripe", "quickbooks"],
      entities: [stripeCharge],
      actions: [],
      views: []
    })
  },
  {
    id: "fin-payment-recovery",
    name: "Failed Payment Recovery Dashboard",
    description: "Track failed charges and recovery status.",
    category: "Payments & Finance",
    integrations: ["stripe", "slack"],
    trigger: "Event-based",
    output: "Table",
    prompt: "Show me all currently failed Stripe payments and their recovery status.",
    spec: buildSpec({
      id: "fin-payment-recovery",
      name: "Failed Payment Recovery Dashboard",
      description: "Monitor involuntary churn.",
      purpose: "Recover lost recurring revenue.",
      integrations: ["stripe", "slack"],
      entities: [stripeCharge, slackMessage],
      actions: [],
      views: []
    })
  },
  {
    id: "fin-rev-recognition",
    name: "Revenue Recognition Visibility Tool",
    description: "Internal view of revenue timing and recognition.",
    category: "Payments & Finance",
    integrations: ["stripe", "quickbooks"],
    trigger: "Time-based",
    output: "Table",
    prompt: "Generate a revenue recognition report for last month.",
    spec: buildSpec({
      id: "fin-rev-recognition",
      name: "Revenue Recognition Visibility Tool",
      description: "Accrual based revenue visibility.",
      purpose: "Support accounting closes.",
      integrations: ["stripe", "quickbooks"],
      entities: [stripeCharge],
      actions: [],
      views: []
    })
  },
  {
    id: "fin-sub-risk",
    name: "Subscription Risk Analyzer",
    description: "Predict churn using usage + payment signals.",
    category: "Payments & Finance",
    integrations: ["stripe", "google_analytics"],
    trigger: "Time-based",
    output: "Alert",
    prompt: "Identify subscriptions at risk due to low usage.",
    spec: buildSpec({
      id: "fin-sub-risk",
      name: "Subscription Risk Analyzer",
      description: "Usage-based financial risk detection.",
      purpose: "Identify financial churn signals early.",
      integrations: ["stripe", "google_analytics"],
      entities: [stripeCharge],
      actions: [],
      views: []
    })
  },
  {
    id: "fin-ops-control",
    name: "Finance Ops Control Panel",
    description: "Unified view of billing, refunds, disputes, and payouts.",
    category: "Payments & Finance",
    integrations: ["stripe", "quickbooks"],
    trigger: "Prompt-based",
    output: "Table",
    prompt: "Show the current status of all pending finance operations.",
    spec: buildSpec({
      id: "fin-ops-control",
      name: "Finance Ops Control Panel",
      description: "Operational view of money movement.",
      purpose: "Centralize finance administration.",
      integrations: ["stripe", "quickbooks"],
      entities: [stripeCharge],
      actions: [],
      views: []
    })
  },

  // =================================================================
  // 🔁 ASSEMBLR CROSS-INTEGRATION POWER TOOLS
  // =================================================================
  {
    id: "pwr-tool-builder",
    name: "Internal Tool Builder for Non-Engineers",
    description: "Create internal tools via natural language.",
    category: "Assemblr Cross-Integration Power Tools",
    integrations: ["github", "slack", "notion"],
    trigger: "Prompt-based",
    output: "Document",
    prompt: "Build an internal tool that lets me search GitHub and post results to Slack.",
    spec: buildSpec({
      id: "pwr-tool-builder",
      name: "Internal Tool Builder",
      description: "Democratized automation creation.",
      purpose: "Enable non-technical users to build workflows.",
      integrations: ["github", "slack", "notion"],
      entities: [githubIssue, slackMessage, notionPage],
      actions: [],
      views: []
    })
  },
  {
    id: "pwr-exec-center",
    name: "Executive Command Center",
    description: "Chat-driven interface across all systems.",
    category: "Assemblr Cross-Integration Power Tools",
    integrations: ["slack", "hubspot", "linear", "stripe"],
    trigger: "Prompt-based",
    output: "Summary",
    prompt: "Give me an executive overview of the company's metrics right now.",
    spec: buildSpec({
      id: "pwr-exec-center",
      name: "Executive Command Center",
      description: "Unified cross-system control.",
      purpose: "Provide single-entry command of the business.",
      integrations: ["slack", "hubspot", "linear", "stripe"],
      entities: [slackMessage, hubspotDeal, linearIssue, stripeCharge],
      actions: [],
      views: []
    })
  },
  {
    id: "pwr-compliance-monitor",
    name: "Compliance Readiness Monitor",
    description: "Track audit-relevant signals in real time.",
    category: "Assemblr Cross-Integration Power Tools",
    integrations: ["github", "notion", "slack"],
    trigger: "Time-based",
    output: "Alert",
    prompt: "Monitor for any actions that could violate our compliance standards.",
    spec: buildSpec({
      id: "pwr-compliance-monitor",
      name: "Compliance Readiness Monitor",
      description: "Real-time compliance auditing.",
      purpose: "Maintain continuous audit readiness.",
      integrations: ["github", "notion", "slack"],
      entities: [githubPR, notionPage, slackMessage],
      actions: [],
      views: []
    })
  },
  {
    id: "pwr-kpi-engine",
    name: "Org-Wide KPI Engine",
    description: "Generate KPIs automatically from live data.",
    category: "Assemblr Cross-Integration Power Tools",
    integrations: ["google_analytics", "hubspot", "linear", "stripe"],
    trigger: "Time-based",
    output: "Table",
    prompt: "Generate the KPI dashboard for the leadership meeting.",
    spec: buildSpec({
      id: "pwr-kpi-engine",
      name: "Org-Wide KPI Engine",
      description: "Autonomous metric calculation.",
      purpose: "Remove manual spreadsheet work.",
      integrations: ["google_analytics", "hubspot", "linear", "stripe"],
      entities: [hubspotDeal, linearIssue, stripeCharge],
      actions: [],
      views: []
    })
  },
  {
    id: "pwr-version-compare",
    name: "Tool Version Comparison Dashboard",
    description: "Compare outputs across tool versions.",
    category: "Assemblr Cross-Integration Power Tools",
    integrations: ["github", "slack"],
    trigger: "Prompt-based",
    output: "Table",
    prompt: "Show me a comparison of how the last two versions of the 'Sentiment Monitor' performed.",
    spec: buildSpec({
      id: "pwr-version-compare",
      name: "Tool Version Comparison Dashboard",
      description: "Internal tool performance monitoring.",
      purpose: "Ensure tool improvement over time.",
      integrations: ["github", "slack"],
      entities: [slackMessage],
      actions: [],
      views: []
    })
  },
  {
    id: "pwr-board-update",
    name: "Automated Board Update Generator",
    description: "Weekly board-ready updates from live data.",
    category: "Assemblr Cross-Integration Power Tools",
    integrations: ["hubspot", "linear", "stripe", "notion"],
    trigger: "Time-based",
    output: "Document",
    prompt: "Generate the weekly board summary using all available data.",
    spec: buildSpec({
      id: "pwr-board-update",
      name: "Automated Board Update Generator",
      description: "Board-level operational synthesis.",
      purpose: "Reduce the tax of investor reporting.",
      integrations: ["hubspot", "linear", "stripe", "notion"],
      entities: [hubspotDeal, linearIssue, stripeCharge, notionPage],
      actions: [],
      views: []
    })
  },
  {
    id: "pwr-chatops-console",
    name: "Internal ChatOps Console",
    description: "Safely run internal actions via chat.",
    category: "Assemblr Cross-Integration Power Tools",
    integrations: ["slack", "github", "linear"],
    trigger: "Prompt-based",
    output: "Summary",
    prompt: "Can you list all open PRs and let me merge the ready ones from here?",
    spec: buildSpec({
      id: "pwr-chatops-console",
      name: "Internal ChatOps Console",
      description: "Chat-based system control.",
      purpose: "Enable rapid operational response.",
      integrations: ["slack", "github", "linear"],
      entities: [slackMessage, githubPR, linearIssue],
      actions: [],
      views: []
    })
  },
  {
    id: "pwr-crisis-room",
    name: "Crisis Response Control Room",
    description: "Combine engineering, support, and revenue signals.",
    category: "Assemblr Cross-Integration Power Tools",
    integrations: ["slack", "intercom", "hubspot", "github"],
    trigger: "Event-based",
    output: "Alert",
    prompt: "Initiate crisis control room for the current system outage.",
    spec: buildSpec({
      id: "pwr-crisis-room",
      name: "Crisis Response Control Room",
      description: "Consolidated war room intelligence.",
      purpose: "Minimize MTTD and MTTR during crises.",
      integrations: ["slack", "intercom", "hubspot", "github"],
      entities: [slackMessage, intercomTicket, hubspotDeal, githubIssue],
      actions: [],
      views: []
    })
  },
  {
    id: "pwr-health-index",
    name: "Company Health Index",
    description: "Single score aggregating engineering, revenue, support, and finance.",
    category: "Assemblr Cross-Integration Power Tools",
    integrations: ["linear", "hubspot", "intercom", "stripe"],
    trigger: "Time-based",
    output: "Summary",
    prompt: "Calculate the overall Company Health Index score.",
    spec: buildSpec({
      id: "pwr-health-index",
      name: "Company Health Index",
      description: "Top-level organizational metric.",
      purpose: "Single pulse of the entire business.",
      integrations: ["linear", "hubspot", "intercom", "stripe"],
      entities: [linearIssue, hubspotDeal, intercomTicket, stripeCharge],
      actions: [],
      views: []
    })
  }
];
