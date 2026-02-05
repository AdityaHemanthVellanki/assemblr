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
    logoUrl: "",
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
    logoUrl: "",
    description: "Read messages and send notifications.",
    connectionMode: "hosted_oauth",
    auth: {
      type: "oauth",
      scopes: [
        "channels:read",
        "channels:history",
        "groups:history",
        "im:history",
        "mpim:history",
        "chat:write",
        "files:read",
        "search:read",
        "users:read",
      ],
    },
  },
  {
    id: "notion",
    name: "Notion",
    category: "Files",
    logoUrl: "",
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
    logoUrl: "",
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
    logoUrl: "",
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
