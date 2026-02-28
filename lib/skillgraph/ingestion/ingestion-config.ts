import type { IntegrationId } from "@/lib/toolos/spec";

/**
 * Per-integration ingestion configuration.
 *
 * Maps each integration to the Composio actions needed for backfill,
 * their default parameters, and any pagination/rate limit hints.
 */
export interface IngestionActionConfig {
  /** Composio action name (from STATIC_TO_COMPOSIO mapping) */
  composioAction: string;
  /** Default input params for this action */
  defaultParams: Record<string, any>;
  /** Entity type this action produces */
  entityType: string;
  /** Maximum records to fetch in a single call */
  maxResults: number;
}

export interface IntegrationIngestionConfig {
  /** Ordered list of actions to execute during backfill */
  actions: IngestionActionConfig[];
  /** Minimum delay between API calls (ms) — rate limiting */
  rateLimitMs: number;
}

/**
 * Ingestion configs for all 17 active integrations.
 *
 * Each config lists the READ actions to call during backfill,
 * their default parameters, and the entity type they produce.
 */
export const INGESTION_CONFIGS: Partial<Record<IntegrationId, IntegrationIngestionConfig>> = {
  github: {
    actions: [
      {
        composioAction: "GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER",
        defaultParams: { per_page: 30, sort: "updated" },
        entityType: "repo",
        maxResults: 30,
      },
      {
        // Search needs a user qualifier — use "is:issue is:open" with a broad qualifier
        composioAction: "GITHUB_SEARCH_ISSUES_AND_PULL_REQUESTS",
        defaultParams: { q: "is:issue is:open", per_page: 50 },
        entityType: "issue",
        maxResults: 50,
      },
    ],
    rateLimitMs: 500,
  },

  slack: {
    actions: [
      {
        composioAction: "SLACKBOT_LIST_ALL_CHANNELS",
        defaultParams: { limit: 100 },
        entityType: "channel",
        maxResults: 100,
      },
      {
        composioAction: "SLACKBOT_LIST_ALL_USERS",
        defaultParams: { limit: 100 },
        entityType: "user",
        maxResults: 100,
      },
    ],
    rateLimitMs: 1000,
  },

  linear: {
    actions: [
      {
        composioAction: "LINEAR_LIST_LINEAR_ISSUES",
        defaultParams: {},
        entityType: "issue",
        maxResults: 100,
      },
      // LINEAR_LIST_LINEAR_TEAMS and LINEAR_LIST_LINEAR_LABELS both require IDs we don't have
      {
        composioAction: "LINEAR_LIST_LINEAR_PROJECTS",
        defaultParams: {},
        entityType: "project",
        maxResults: 50,
      },
      {
        composioAction: "LINEAR_LIST_LINEAR_CYCLES",
        defaultParams: {},
        entityType: "cycle",
        maxResults: 50,
      },
    ],
    rateLimitMs: 200,
  },

  notion: {
    actions: [
      {
        composioAction: "NOTION_SEARCH_NOTION_PAGE",
        defaultParams: { query: "" },
        entityType: "page",
        maxResults: 100,
      },
    ],
    rateLimitMs: 500,
  },

  hubspot: {
    actions: [
      {
        composioAction: "HUBSPOT_HUBSPOT_LIST_CONTACTS",
        defaultParams: {},
        entityType: "contact",
        maxResults: 100,
      },
      {
        composioAction: "HUBSPOT_HUBSPOT_LIST_COMPANIES",
        defaultParams: {},
        entityType: "company",
        maxResults: 100,
      },
      {
        composioAction: "HUBSPOT_HUBSPOT_LIST_DEALS",
        defaultParams: {},
        entityType: "deal",
        maxResults: 100,
      },
    ],
    rateLimitMs: 500,
  },

  trello: {
    actions: [
      {
        composioAction: "TRELLO_GET_MEMBERS_BOARDS_BY_ID_MEMBER",
        defaultParams: { idMember: "me" },
        entityType: "board",
        maxResults: 50,
      },
    ],
    rateLimitMs: 500,
  },

  intercom: {
    actions: [
      // INTERCOM_LIST_CONVERSATIONS returns 403 Forbidden (permission issue)
      {
        composioAction: "INTERCOM_LIST_ALL_COMPANIES",
        defaultParams: {},
        entityType: "company",
        maxResults: 50,
      },
    ],
    rateLimitMs: 500,
  },

  gitlab: {
    actions: [
      {
        composioAction: "GITLAB_GET_PROJECTS",
        defaultParams: {},
        entityType: "project",
        maxResults: 50,
      },
    ],
    rateLimitMs: 500,
  },

  bitbucket: {
    actions: [
      {
        composioAction: "BITBUCKET_LIST_WORKSPACES",
        defaultParams: {},
        entityType: "workspace",
        maxResults: 50,
      },
    ],
    rateLimitMs: 500,
  },

  asana: {
    actions: [
      {
        composioAction: "ASANA_GET_MULTIPLE_WORKSPACES",
        defaultParams: {},
        entityType: "workspace",
        maxResults: 50,
      },
    ],
    rateLimitMs: 500,
  },

  clickup: {
    actions: [
      {
        composioAction: "CLICKUP_GET_AUTHORIZED_TEAMS_WORKSPACES",
        defaultParams: {},
        entityType: "workspace",
        maxResults: 50,
      },
      // CLICKUP_GET_TASKS/SPACES require parent IDs we don't have at ingestion time
    ],
    rateLimitMs: 500,
  },

  zoom: {
    actions: [
      {
        composioAction: "ZOOM_LIST_MEETINGS",
        defaultParams: { userId: "me" },
        entityType: "meeting",
        maxResults: 50,
      },
    ],
    rateLimitMs: 500,
  },

  // microsoft_teams: All MS Teams Composio actions return auth errors (broken connection)

  outlook: {
    actions: [
      {
        composioAction: "OUTLOOK_OUTLOOK_LIST_MESSAGES",
        defaultParams: {},
        entityType: "email",
        maxResults: 50,
      },
      {
        composioAction: "OUTLOOK_OUTLOOK_LIST_EVENTS",
        defaultParams: {},
        entityType: "calendar_event",
        maxResults: 50,
      },
    ],
    rateLimitMs: 500,
  },

  discord: {
    actions: [
      {
        composioAction: "DISCORD_LIST_MY_GUILDS",
        defaultParams: {},
        entityType: "guild",
        maxResults: 50,
      },
    ],
    rateLimitMs: 500,
  },

  airtable: {
    actions: [
      {
        composioAction: "AIRTABLE_LIST_BASES",
        defaultParams: {},
        entityType: "base",
        maxResults: 50,
      },
    ],
    rateLimitMs: 500,
  },
};

/**
 * Get ingestion config for an integration. Returns undefined for
 * integrations that aren't configured (e.g., stripe, quickbooks).
 */
export function getIngestionConfig(
  integrationId: IntegrationId,
): IntegrationIngestionConfig | undefined {
  return INGESTION_CONFIGS[integrationId];
}

/**
 * Get all integration IDs that have ingestion configs.
 */
export function getConfiguredIntegrationIds(): IntegrationId[] {
  return Object.keys(INGESTION_CONFIGS) as IntegrationId[];
}
