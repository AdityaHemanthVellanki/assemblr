/**
 * Scenario A: Incident Response Workflow
 *
 * Creates a realistic cross-integration incident response flow:
 * 1. Create Linear P1 issue (incident ticket)
 * 2. Post Slack alert referencing the issue
 * 3. Reply in Slack thread with investigation updates
 * 4. Create GitHub issue for the fix
 * 5. Create Notion postmortem document
 *
 * All references propagate across integrations:
 * - Linear issue ID → Slack message
 * - Slack thread link → GitHub issue body
 * - All refs → Notion postmortem
 */

import type { SeedScenario } from "../types";
import { SEED_TAG } from "../types";

export const INCIDENT_RESPONSE_SCENARIO: SeedScenario = {
  name: "incident-response",
  description: "Multi-tool incident response workflow: Linear → Slack → GitHub → Notion",
  requiredIntegrations: ["linear", "slack", "github", "notion"],
  steps: [
    // Step 1: Get Linear teams (we need a team ID to create issues)
    {
      id: "linear_teams",
      integration: "linear",
      action: "list_teams",
      composioAction: "LINEAR_GET_ALL_LINEAR_TEAMS",
      payload: {},
      resourceType: "linear_team",
    },

    // Step 2: Create Linear P1 incident issue
    {
      id: "linear_issue",
      integration: "linear",
      action: "create_issue",
      composioAction: "LINEAR_CREATE_LINEAR_ISSUE",
      payload: {
        title: `${SEED_TAG} P1 Incident: API Gateway 5xx spike — response times degraded`,
        description: [
          `${SEED_TAG} Incident Report`,
          "",
          "**Severity:** P1 — Critical",
          "**Impact:** API gateway returning 5xx errors, ~30% of requests failing",
          "**First detected:** Automated alert from monitoring at 14:32 UTC",
          "",
          "## Timeline",
          "- 14:32 — Alert triggered: 5xx rate > 5% threshold",
          "- 14:35 — On-call engineer paged",
          "- 14:40 — Root cause identified: database connection pool exhaustion",
          "",
          "## Action Items",
          "- [ ] Increase connection pool limits",
          "- [ ] Add circuit breaker for DB connections",
          "- [ ] Update monitoring thresholds",
        ].join("\n"),
        priority: 1,
        // teamId injected at runtime from linear_teams step
      },
      dependsOn: ["linear_teams"],
      resourceType: "linear_issue",
      resourceIdPath: "id",
    },

    // Step 3: Get Slack channels to find an appropriate channel
    {
      id: "slack_channels",
      integration: "slack",
      action: "list_channels",
      composioAction: "SLACKBOT_LIST_ALL_CHANNELS",
      payload: { limit: 20 },
      resourceType: "slack_channel",
    },

    // Step 4: Post Slack alert referencing the Linear issue
    {
      id: "slack_alert",
      integration: "slack",
      action: "send_message",
      composioAction: "SLACKBOT_SEND_MESSAGE",
      payload: {
        text: [
          `${SEED_TAG} :rotating_light: *P1 INCIDENT TRIGGERED*`,
          "",
          "*Issue:* API Gateway 5xx spike — response times degraded",
          "*Severity:* P1 — Critical",
          "*Linear:* Issue created (see thread for details)",
          "",
          "On-call team has been paged. Please join this thread for updates.",
        ].join("\n"),
        // channel injected at runtime from slack_channels step
      },
      dependsOn: ["linear_issue", "slack_channels"],
      resourceType: "slack_message",
      resourceIdPath: "ts",
    },

    // Step 5: Reply in Slack thread — investigation update
    {
      id: "slack_thread_1",
      integration: "slack",
      action: "reply_thread",
      composioAction: "SLACKBOT_SEND_MESSAGE",
      payload: {
        text: `${SEED_TAG} :mag: *Investigation Update*\n\nRoot cause identified: Database connection pool exhaustion.\nCurrent pool size: 20 connections, all saturated.\nProposing increase to 50 connections + adding circuit breaker.\n\nWorking on the fix now.`,
        // channel + thread_ts injected from slack_alert step
      },
      dependsOn: ["slack_alert"],
      resourceType: "slack_message",
      resourceIdPath: "ts",
    },

    // Step 6: Reply in Slack thread — fix deployed
    {
      id: "slack_thread_2",
      integration: "slack",
      action: "reply_thread",
      composioAction: "SLACKBOT_SEND_MESSAGE",
      payload: {
        text: `${SEED_TAG} :white_check_mark: *Fix Deployed*\n\nConnection pool increased to 50. Circuit breaker added.\n5xx rate back to 0%. Monitoring for the next 30 minutes.\n\nPostmortem to follow.`,
        // channel + thread_ts injected from slack_alert step
      },
      dependsOn: ["slack_alert"],
      resourceType: "slack_message",
      resourceIdPath: "ts",
    },

    // Step 7: Get GitHub repos (need owner/repo for issue creation)
    {
      id: "github_repos",
      integration: "github",
      action: "list_repos",
      composioAction: "GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER",
      payload: { per_page: 5, sort: "updated" },
      resourceType: "github_repo",
    },

    // Step 8: Create GitHub issue for the fix
    {
      id: "github_issue",
      integration: "github",
      action: "create_issue",
      composioAction: "GITHUB_CREATE_AN_ISSUE",
      payload: {
        title: `${SEED_TAG} fix: increase DB connection pool + add circuit breaker`,
        body: [
          `${SEED_TAG} Incident Fix`,
          "",
          "## Context",
          "Related to P1 incident: API Gateway 5xx spike.",
          "Root cause: database connection pool exhaustion under load.",
          "",
          "## Changes",
          "- Increase connection pool from 20 → 50",
          "- Add circuit breaker pattern for DB connections",
          "- Add connection pool metrics to monitoring dashboard",
          "",
          "## Testing",
          "- Load test with 2x normal traffic",
          "- Verify circuit breaker trips at expected threshold",
          "- Monitor for 30 minutes post-deploy",
        ].join("\n"),
        labels: ["incident", "P1", "infrastructure"],
        // owner + repo injected at runtime from github_repos step
      },
      dependsOn: ["github_repos", "slack_thread_2"],
      resourceType: "github_issue",
      resourceIdPath: "number",
    },

    // Step 9: Fetch Notion pages to find a parent page
    {
      id: "notion_pages",
      integration: "notion",
      action: "list_pages",
      composioAction: "NOTION_FETCH_DATA",
      payload: { get_pages: true, page_size: 5 },
      resourceType: "notion_page",
    },

    // Step 10: Create Notion postmortem document
    {
      id: "notion_postmortem",
      integration: "notion",
      action: "create_page",
      composioAction: "NOTION_CREATE_NOTION_PAGE",
      payload: {
        title: `${SEED_TAG} Postmortem: API Gateway 5xx Incident`,
        // parent_id resolved at runtime from notion_pages step
        content: [
          "# Postmortem: API Gateway 5xx Incident",
          "",
          `${SEED_TAG}`,
          "",
          "## Summary",
          "On-call was paged for a P1 incident involving elevated 5xx error rates on the API gateway.",
          "Root cause: database connection pool exhaustion under sustained load.",
          "",
          "## Impact",
          "- Duration: ~45 minutes",
          "- ~30% of API requests returned 5xx errors",
          "- Customer-facing impact: intermittent errors in dashboard loading",
          "",
          "## Root Cause",
          "The database connection pool was configured with 20 connections.",
          "Under a traffic spike, all connections were saturated, causing new requests to fail.",
          "",
          "## Resolution",
          "- Increased connection pool to 50 connections",
          "- Added circuit breaker pattern to prevent cascade failures",
          "- Deployed fix within 25 minutes of detection",
          "",
          "## Action Items",
          "- [ ] Add connection pool utilization to monitoring dashboard",
          "- [ ] Set up auto-scaling for connection pool",
          "- [ ] Review other services for similar pool limits",
          "",
          "## Cross-references",
          "- Linear issue: P1 incident ticket",
          "- Slack thread: #incidents channel",
          "- GitHub issue: connection pool fix PR",
        ].join("\n"),
      },
      dependsOn: ["github_issue", "notion_pages"],
      resourceType: "notion_page",
      resourceIdPath: "id",
    },
  ],
};
