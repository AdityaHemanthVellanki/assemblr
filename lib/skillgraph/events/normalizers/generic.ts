import type { IntegrationId } from "@/lib/toolos/spec";
import type { OrgEvent } from "../event-schema";
import { makeEventId } from "../event-schema";

/**
 * Generic normalizer for integrations without a dedicated normalizer.
 *
 * Applies heuristic field detection to map arbitrary Composio outputs
 * to the OrgEvent schema. Works for: HubSpot, Notion, Trello, Airtable,
 * Intercom, Zoom, GitLab, Bitbucket, Asana, Microsoft Teams, Outlook,
 * Stripe, Discord, ClickUp, QuickBooks, Google Analytics, etc.
 */

/** Common field names for timestamps, ordered by priority */
const TIMESTAMP_FIELDS = [
  "updatedAt", "updated_at", "modifiedAt", "modified_at",
  "createdAt", "created_at", "date", "timestamp", "ts",
  "dateLastActivity", "date_last_activity",
  "closedAt", "closed_at", "mergedAt", "merged_at",
  "startDate", "start_date", "endDate", "end_date",
  "dateUpdated", "date_updated", "dateCreated", "date_created",
  "lastModifiedDate", "last_modified_date",
];

/** Common field names for actor/user IDs */
const ACTOR_ID_FIELDS = [
  "user", "userId", "user_id", "creator", "creatorId", "creator_id",
  "author", "authorId", "author_id", "assignee", "assigneeId",
  "ownerId", "owner_id", "owner", "memberId", "member_id",
  "idMemberCreator", "sender", "from",
];

/** Common field names for actor names */
const ACTOR_NAME_FIELDS = [
  "userName", "user_name", "creatorName", "creator_name",
  "authorName", "author_name", "displayName", "display_name",
  "name", "real_name", "realName", "fullName", "full_name",
  "senderName", "sender_name",
];

/** Common field names for entity names/titles */
const ENTITY_NAME_FIELDS = [
  "title", "name", "subject", "summary", "label", "description",
  "boardName", "board_name", "projectName", "project_name",
  "pageName", "page_name",
];

/** Common field names for entity IDs */
const ENTITY_ID_FIELDS = [
  "id", "identifier", "number", "key", "slug",
  "idBoard", "idCard", "idList",
  "record_id", "recordId",
];

/** Integration → entity type heuristics */
const INTEGRATION_ENTITY_TYPES: Record<string, Record<string, string>> = {
  hubspot: {
    default: "contact",
    HUBSPOT_HUBSPOT_LIST_CONTACTS: "contact",
    HUBSPOT_HUBSPOT_LIST_DEALS: "deal",
    HUBSPOT_HUBSPOT_LIST_COMPANIES: "company",
    HUBSPOT_LIST_TICKETS: "ticket",
  },
  notion: {
    default: "page",
    NOTION_SEARCH_NOTION_PAGE: "page",
    NOTION_QUERY_DATABASE: "record",
    NOTION_FETCH_DATABASE: "database",
  },
  trello: {
    default: "card",
    TRELLO_GET_MEMBERS_BOARDS_BY_ID_MEMBER: "board",
    TRELLO_GET_BOARDS_CARDS_BY_ID_BOARD: "card",
    TRELLO_GET_BOARDS_LISTS_BY_ID_BOARD: "list",
  },
  intercom: {
    default: "conversation",
    INTERCOM_LIST_CONVERSATIONS: "conversation",
    INTERCOM_LIST_ALL_COMPANIES: "company",
    INTERCOM_GET_A_CONTACT: "contact",
  },
  outlook: {
    default: "email",
    OUTLOOK_OUTLOOK_LIST_MESSAGES: "email",
    OUTLOOK_OUTLOOK_LIST_EVENTS: "calendar_event",
    OUTLOOK_OUTLOOK_LIST_CONTACTS: "contact",
  },
  stripe: {
    default: "payment",
    STRIPE_LIST_CHARGES: "charge",
    STRIPE_LIST_CUSTOMERS: "customer",
    STRIPE_LIST_SUBSCRIPTIONS: "subscription",
    STRIPE_LIST_INVOICES: "invoice",
  },
  gitlab: {
    default: "project",
    GITLAB_GET_PROJECTS: "project",
    GITLAB_GET_PROJECT_MERGE_REQUESTS: "merge_request",
    GITLAB_LIST_REPOSITORY_COMMITS: "commit",
    GITLAB_LIST_PROJECT_PIPELINES: "pipeline",
  },
  bitbucket: {
    default: "repo",
    BITBUCKET_LIST_WORKSPACES: "workspace",
    BITBUCKET_LIST_REPOSITORIES_IN_WORKSPACE: "repo",
    BITBUCKET_LIST_PULL_REQUESTS: "pull_request",
  },
  asana: {
    default: "task",
    ASANA_GET_MULTIPLE_WORKSPACES: "workspace",
    ASANA_GET_TASKS_FROM_A_PROJECT: "task",
    ASANA_GET_WORKSPACE_PROJECTS: "project",
  },
  clickup: {
    default: "task",
    CLICKUP_GET_AUTHORIZED_TEAMS_WORKSPACES: "workspace",
    CLICKUP_GET_TASKS: "task",
    CLICKUP_GET_SPACES: "space",
  },
  zoom: {
    default: "meeting",
    ZOOM_LIST_MEETINGS: "meeting",
    ZOOM_LIST_ALL_RECORDINGS: "recording",
  },
  microsoft_teams: {
    default: "message",
    MICROSOFT_TEAMS_TEAMS_LIST: "team",
    MICROSOFT_TEAMS_CHATS_GET_ALL_CHATS: "chat",
    MICROSOFT_TEAMS_TEAMS_LIST_CHANNELS: "channel",
  },
  discord: {
    default: "guild",
    DISCORD_LIST_MY_GUILDS: "guild",
    DISCORD_LIST_MY_CONNECTIONS: "connection",
  },
  airtable: {
    default: "record",
    AIRTABLE_LIST_BASES: "base",
    AIRTABLE_LIST_RECORDS: "record",
  },
};

function findField(record: any, candidates: string[]): any {
  for (const field of candidates) {
    // Direct field
    if (record[field] !== undefined && record[field] !== null) return record[field];
    // Nested object (e.g., record.user.login, record.creator.id)
    if (typeof record[field] === "object" && record[field]?.id) return record[field].id;
  }
  // Check nested "properties" (HubSpot pattern)
  if (record.properties && typeof record.properties === "object") {
    for (const field of candidates) {
      if (record.properties[field] !== undefined) return record.properties[field];
    }
  }
  return undefined;
}

function resolveTimestamp(record: any): string {
  const val = findField(record, TIMESTAMP_FIELDS);
  if (!val) return new Date().toISOString();
  // Handle Unix timestamps (seconds)
  if (typeof val === "number") {
    return val > 1e12
      ? new Date(val).toISOString()
      : new Date(val * 1000).toISOString();
  }
  // Handle string timestamps
  if (typeof val === "string") {
    const d = new Date(val);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }
  return new Date().toISOString();
}

export function normalizeGeneric(
  rawRecords: any[],
  orgId: string,
  integrationId: IntegrationId,
  actionHint?: string,
): OrgEvent[] {
  const events: OrgEvent[] = [];
  const entityTypes = INTEGRATION_ENTITY_TYPES[integrationId] || {};
  const entityType = (actionHint && entityTypes[actionHint]) || entityTypes.default || "record";

  for (const record of rawRecords) {
    if (!record || typeof record !== "object") continue;

    const timestamp = resolveTimestamp(record);
    const actorId = String(findField(record, ACTOR_ID_FIELDS) || "unknown");
    const actorName = findField(record, ACTOR_NAME_FIELDS) as string | undefined;
    const entityId = String(findField(record, ENTITY_ID_FIELDS) || `${Date.now()}`);
    const entityName = findField(record, ENTITY_NAME_FIELDS) as string | undefined;

    events.push({
      id: makeEventId(integrationId, `${entityType}.observed`, entityId, timestamp),
      orgId,
      source: integrationId,
      eventType: `${entityType}.observed`,
      actorId,
      actorName,
      entityType,
      entityId,
      entityName,
      timestamp,
      metadata: summarizeMetadata(record),
      relatedEntityIds: [],
    });
  }

  return events;
}

/**
 * Extract a lightweight metadata summary from a record.
 * Keeps only scalar fields to avoid bloating the event store.
 */
function summarizeMetadata(record: any): Record<string, any> {
  const meta: Record<string, any> = {};
  let count = 0;
  for (const [key, value] of Object.entries(record)) {
    if (count >= 15) break; // Cap metadata fields
    if (value === null || value === undefined) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      meta[key] = typeof value === "string" ? value.slice(0, 200) : value;
      count++;
    }
  }
  return meta;
}
