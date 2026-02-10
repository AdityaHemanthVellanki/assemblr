import { IntegrationConnector, IntegrationUIConfig } from "./types";

export type Phase1IntegrationId =
  | "github"
  | "slack"
  | "notion"
  | "linear"
  | "google";

export const CONNECTORS: Record<string, IntegrationConnector> = {};

export const INTEGRATIONS_UI: readonly IntegrationUIConfig[] = [
  {
    id: "github",
    name: "GitHub",
    category: "Engineering",
    logoUrl: "https://cdn.simpleicons.org/github/ffffff",
    description: "Sync repositories, issues, and PRs.",
    connectionMode: "hosted_oauth",
    auth: {
      type: "oauth",
      scopes: ["repo", "read:org", "user"],
    },
  },
  {
    id: "slack",
    name: "Slack",
    category: "Messaging",
    logoUrl: "https://cdn.simpleicons.org/slack/ffffff",
    description: "Read messages and send notifications.",
    connectionMode: "hosted_oauth",
    auth: {
      type: "oauth",
      scopes: ["chat:write", "channels:read", "users:read", "bot"],
    },
  },
  {
    id: "notion",
    name: "Notion",
    category: "Files",
    logoUrl: "https://cdn.simpleicons.org/notion/ffffff",
    description: "Access pages and databases.",
    connectionMode: "hosted_oauth",
    auth: {
      type: "oauth",
      scopes: [],
    },
  },
  {
    id: "linear",
    name: "Linear",
    category: "Engineering",
    logoUrl: "https://cdn.simpleicons.org/linear/ffffff",
    description: "Manage issues and projects.",
    connectionMode: "hosted_oauth",
    auth: {
      type: "oauth",
      scopes: ["read", "write"],
    },
  },
  {
    id: "google",
    name: "Google",
    category: "Productivity",
    logoUrl: "https://cdn.simpleicons.org/google",
    description: "Access Sheets, Docs, Gmail, and Meet.",
    connectionMode: "hosted_oauth",
    auth: {
      type: "oauth",
      scopes: [
        "openid",
        // Use full URLs for email/profile since Google returns these in the token response
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/documents",
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/calendar",
      ],
    },
  },
  {
    id: "hubspot",
    name: "HubSpot",
    category: "CRM",
    logoUrl: "https://cdn.simpleicons.org/hubspot",
    description: "Manage contacts, deals, and activities.",
    connectionMode: "hosted_oauth",
    auth: {
      type: "oauth",
      scopes: ["contacts", "content"],
    },
  },
  {
    id: "stripe",
    name: "Stripe",
    category: "Payments",
    logoUrl: "https://cdn.simpleicons.org/stripe",
    description: "Manage payments and subscriptions.",
    connectionMode: "hosted_oauth",
    auth: {
      type: "oauth",
      scopes: ["read", "write"],
    },
  },
  {
    id: "trello",
    name: "Trello",
    category: "Productivity",
    logoUrl: "https://cdn.simpleicons.org/trello",
    description: "Manage boards, lists, and cards.",
    connectionMode: "hosted_oauth",
    auth: {
      type: "oauth",
      scopes: ["read", "write"],
    },
  },
  {
    id: "airtable",
    name: "Airtable",
    category: "Productivity",
    logoUrl: "https://cdn.simpleicons.org/airtable",
    description: "Build powerful databases and apps.",
    connectionMode: "hosted_oauth",
    auth: {
      type: "oauth",
      scopes: ["data.records:read", "data.records:write"],
    },
  },
  {
    id: "discord",
    name: "Discord",
    category: "Messaging",
    logoUrl: "https://cdn.simpleicons.org/discord",
    description: "Connect to your Discord server.",
    connectionMode: "hosted_oauth",
    auth: {
      type: "oauth",
      scopes: ["identify", "guilds"],
    },
  },
  {
    id: "intercom",
    name: "Intercom",
    category: "Support",
    logoUrl: "https://cdn.simpleicons.org/intercom",
    description: "Connect with customers on your site.",
    connectionMode: "hosted_oauth",
    auth: {
      type: "oauth",
      scopes: ["read", "write"],
    },
  },
  {
    id: "zoom",
    name: "Zoom",
    category: "Productivity",
    logoUrl: "https://cdn.simpleicons.org/zoom",
    description: "Video conferencing and webinars.",
    connectionMode: "hosted_oauth",
    auth: {
      type: "oauth",
      scopes: ["meeting:read", "meeting:write"],
    },
  },
  {
    id: "gitlab",
    name: "GitLab",
    category: "Engineering",
    logoUrl: "https://cdn.simpleicons.org/gitlab",
    description: "DevOps lifecycle tool.",
    connectionMode: "hosted_oauth",
    auth: { type: "oauth", scopes: ["api"] },
  },
  {
    id: "bitbucket",
    name: "Bitbucket",
    category: "Engineering",
    logoUrl: "https://cdn.simpleicons.org/bitbucket",
    description: "Git solution for teams.",
    connectionMode: "hosted_oauth",
    auth: { type: "oauth", scopes: ["repository", "pullrequest"] },
  },
  {
    id: "asana",
    name: "Asana",
    category: "Productivity",
    logoUrl: "https://cdn.simpleicons.org/asana",
    description: "Track projects and tasks.",
    connectionMode: "hosted_oauth",
    auth: { type: "oauth", scopes: ["default"] },
  },
  {
    id: "clickup",
    name: "ClickUp",
    category: "Productivity",
    logoUrl: "https://cdn.simpleicons.org/clickup",
    description: "One app to replace them all.",
    connectionMode: "hosted_oauth",
    auth: { type: "oauth", scopes: [] },
  },
  {
    id: "microsoft_teams",
    name: "Microsoft Teams",
    category: "Communication",
    logoUrl: "https://cdn.simpleicons.org/microsoftteams/ffffff",
    description: "Chat and collaboration.",
    connectionMode: "hosted_oauth",
    auth: { type: "oauth", scopes: ["User.Read", "Team.ReadBasic.All", "ChannelMessage.Send"] },
  },
  {
    id: "outlook",
    name: "Outlook",
    category: "Communication",
    logoUrl: "https://cdn.simpleicons.org/microsoftoutlook/ffffff",
    description: "Email and calendar.",
    connectionMode: "hosted_oauth",
    auth: { type: "oauth", scopes: ["Mail.Read", "Mail.Send", "Calendars.Read"] },
  },
  {
    id: "google_analytics",
    name: "Google Analytics",
    category: "Analytics",
    logoUrl: "https://cdn.simpleicons.org/googleanalytics",
    description: "Web analytics service.",
    connectionMode: "hosted_oauth",
    auth: { type: "oauth", scopes: ["https://www.googleapis.com/auth/analytics.readonly"] },
  },
  {
    id: "quickbooks",
    name: "QuickBooks",
    category: "Analytics",
    logoUrl: "https://cdn.simpleicons.org/quickbooks",
    description: "Accounting software.",
    connectionMode: "hosted_oauth",
    auth: { type: "oauth", scopes: ["com.intuit.quickbooks.accounting"] },
  },
] as const;

export function getIntegrationUIConfig(integrationId: string): IntegrationUIConfig {
  const found = INTEGRATIONS_UI.find((i) => i.id === integrationId);
  if (!found) throw new Error(`Integration UI config not found: ${integrationId}`);
  return found;
}

export function getConnector(integrationId: string): IntegrationConnector {
  // 1. Try explicit connector
  const connector = CONNECTORS[integrationId];
  if (connector) return connector;

  // 2. Check if valid integration ID exists in UI config
  const config = INTEGRATIONS_UI.find((i) => i.id === integrationId);
  if (config) {
    throw new Error(`Connector not implemented for integration: ${integrationId}`);
  }

  throw new Error(`Connector not found for integration: ${integrationId}`);
}
