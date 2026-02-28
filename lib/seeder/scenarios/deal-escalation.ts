/**
 * Scenario B: Deal Escalation Workflow
 *
 * Creates a realistic cross-integration sales deal escalation:
 * 1. Create HubSpot deal
 * 2. Post Slack alert about the deal
 * 3. Create Linear follow-up task
 * 4. Create Notion summary document
 *
 * All references propagate:
 * - HubSpot deal name → Slack message
 * - Slack alert → Linear issue description
 * - All refs → Notion doc
 */

import type { SeedScenario } from "../types";
import { SEED_TAG } from "../types";

export const DEAL_ESCALATION_SCENARIO: SeedScenario = {
  name: "deal-escalation",
  description: "Multi-tool deal escalation workflow: HubSpot → Slack → Linear → Notion",
  requiredIntegrations: ["hubspot", "slack", "linear", "notion"],
  steps: [
    // Step 1: Create HubSpot deal
    {
      id: "hubspot_deal",
      integration: "hubspot",
      action: "create_deal",
      composioAction: "HUBSPOT_CREATE_DEAL",
      payload: {
        dealname: `${SEED_TAG} Enterprise Expansion — Acme Corp Q1 Renewal`,
        amount: "120000",
      },
      resourceType: "hubspot_deal",
      resourceIdPath: "id",
    },

    // Step 2: Create HubSpot contact associated with the deal
    {
      id: "hubspot_contact",
      integration: "hubspot",
      action: "create_contact",
      composioAction: "HUBSPOT_CREATE_CONTACT",
      payload: {
        email: "seed-sarah.chen@acme-example.com",
        firstname: "Sarah",
        lastname: "Chen",
        company: `${SEED_TAG} Acme Corp`,
        jobtitle: "VP of Engineering",
      },
      resourceType: "hubspot_contact",
      resourceIdPath: "id",
    },

    // Step 3: Get Slack channels
    {
      id: "slack_channels",
      integration: "slack",
      action: "list_channels",
      composioAction: "SLACKBOT_LIST_ALL_CHANNELS",
      payload: { limit: 20 },
      resourceType: "slack_channel",
    },

    // Step 4: Post Slack escalation alert
    {
      id: "slack_alert",
      integration: "slack",
      action: "send_message",
      composioAction: "SLACKBOT_SEND_MESSAGE",
      payload: {
        text: [
          `${SEED_TAG} :chart_with_upwards_trend: *Deal Escalation Alert*`,
          "",
          "*Deal:* Enterprise Expansion — Acme Corp Q1 Renewal",
          "*Amount:* $120,000",
          "*Contact:* Sarah Chen (VP of Engineering)",
          "*Stage:* Qualified to Buy",
          "",
          "This deal has been flagged for escalation. Customer is evaluating competitor.",
          "Action required: schedule exec-level meeting within 48 hours.",
          "",
          "_HubSpot deal created. Follow-up task being created in Linear._",
        ].join("\n"),
        // channel injected at runtime
      },
      dependsOn: ["hubspot_deal", "slack_channels"],
      resourceType: "slack_message",
      resourceIdPath: "ts",
    },

    // Step 5: Get Linear teams
    {
      id: "linear_teams",
      integration: "linear",
      action: "list_teams",
      composioAction: "LINEAR_GET_ALL_LINEAR_TEAMS",
      payload: {},
      resourceType: "linear_team",
    },

    // Step 6: Create Linear follow-up issue
    {
      id: "linear_issue",
      integration: "linear",
      action: "create_issue",
      composioAction: "LINEAR_CREATE_LINEAR_ISSUE",
      payload: {
        title: `${SEED_TAG} Follow-up: Acme Corp deal escalation — exec meeting`,
        description: [
          `${SEED_TAG} Deal Escalation Follow-up`,
          "",
          "## Context",
          "Acme Corp ($120K Q1 renewal) has been escalated.",
          "Customer is evaluating a competitor and needs an exec-level meeting.",
          "",
          "## Action Items",
          "- [ ] Schedule exec meeting within 48 hours",
          "- [ ] Prepare competitive analysis deck",
          "- [ ] Review usage data for renewal pitch",
          "- [ ] Draft custom pricing proposal",
          "",
          "## Cross-references",
          "- HubSpot: Enterprise Expansion — Acme Corp deal",
          "- Slack: #deals channel escalation thread",
        ].join("\n"),
        priority: 2,
        // teamId injected at runtime
      },
      dependsOn: ["linear_teams", "slack_alert"],
      resourceType: "linear_issue",
      resourceIdPath: "id",
    },

    // Step 7: Fetch Notion pages for parent
    {
      id: "notion_pages",
      integration: "notion",
      action: "list_pages",
      composioAction: "NOTION_FETCH_DATA",
      payload: { get_pages: true, page_size: 5 },
      resourceType: "notion_page",
    },

    // Step 8: Create Notion summary document
    {
      id: "notion_summary",
      integration: "notion",
      action: "create_page",
      composioAction: "NOTION_CREATE_NOTION_PAGE",
      payload: {
        title: `${SEED_TAG} Deal Brief: Acme Corp Enterprise Expansion`,
        content: [
          "# Deal Brief: Acme Corp Enterprise Expansion",
          "",
          `${SEED_TAG}`,
          "",
          "## Deal Summary",
          "- **Company:** Acme Corp",
          "- **Contact:** Sarah Chen, VP of Engineering",
          "- **Deal Value:** $120,000",
          "- **Stage:** Qualified to Buy (escalated)",
          "- **Renewal Date:** Q1 2026",
          "",
          "## Situation",
          "Acme Corp is a current customer evaluating competitive alternatives.",
          "The deal has been escalated for executive attention.",
          "",
          "## Strategy",
          "1. Schedule executive meeting within 48 hours",
          "2. Present competitive analysis showing our advantages",
          "3. Offer custom pricing based on expanded usage",
          "4. Provide dedicated support engineer for migration assistance",
          "",
          "## Cross-references",
          "- HubSpot deal: Enterprise Expansion — Acme Corp",
          "- Linear task: exec meeting follow-up",
          "- Slack thread: #deals channel",
        ].join("\n"),
      },
      dependsOn: ["linear_issue", "notion_pages"],
      resourceType: "notion_page",
      resourceIdPath: "id",
    },
  ],
};
