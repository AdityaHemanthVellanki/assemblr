import type { OrgEvent } from "../event-schema";
import { makeEventId } from "../event-schema";

/**
 * Normalize Slack API responses into OrgEvents.
 *
 * Handles: messages, channels, users.
 */
export function normalizeSlack(
  rawRecords: any[],
  orgId: string,
  actionHint?: string,
): OrgEvent[] {
  const events: OrgEvent[] = [];

  for (const record of rawRecords) {
    if (!record || typeof record !== "object") continue;

    if (record.ts && (record.text !== undefined || record.type === "message")) {
      // Slack message
      events.push(normalizeMessage(record, orgId));
    } else if (record.id && (record.is_channel !== undefined || record.is_group !== undefined)) {
      // Channel
      events.push(normalizeChannel(record, orgId));
    } else if (record.id && record.real_name) {
      // User
      events.push(normalizeUser(record, orgId));
    } else if (actionHint?.includes("MESSAGE") || actionHint?.includes("HISTORY")) {
      events.push(normalizeMessage(record, orgId));
    }
  }

  return events;
}

function normalizeMessage(raw: any, orgId: string): OrgEvent {
  // Slack timestamps are Unix epoch with decimal (e.g., "1234567890.123456")
  const ts = raw.ts ? new Date(parseFloat(raw.ts) * 1000).toISOString() : new Date().toISOString();
  const channelId = raw.channel || raw.channel_id || "unknown";

  return {
    id: makeEventId("slack", "message.sent", raw.ts || raw.client_msg_id || "", ts),
    orgId,
    source: "slack",
    eventType: "message.sent",
    actorId: raw.user || raw.bot_id || "unknown",
    actorName: raw.username || raw.user_profile?.real_name,
    entityType: "channel",
    entityId: channelId,
    entityName: raw.channel_name,
    timestamp: ts,
    metadata: {
      text: (raw.text || "").slice(0, 500),
      thread_ts: raw.thread_ts,
      subtype: raw.subtype,
      reactions: raw.reactions?.map((r: any) => ({ name: r.name, count: r.count })),
      has_files: !!(raw.files && raw.files.length > 0),
    },
    relatedEntityIds: raw.thread_ts ? [`slack:thread:${raw.thread_ts}`] : [],
  };
}

function normalizeChannel(raw: any, orgId: string): OrgEvent {
  const timestamp =
    raw.updated ? new Date(raw.updated * 1000).toISOString() :
    raw.created ? new Date(raw.created * 1000).toISOString() :
    new Date().toISOString();

  return {
    id: makeEventId("slack", "channel.updated", raw.id || "", timestamp),
    orgId,
    source: "slack",
    eventType: "channel.updated",
    actorId: raw.creator || "unknown",
    entityType: "channel",
    entityId: raw.id || "",
    entityName: raw.name || raw.name_normalized,
    timestamp,
    metadata: {
      topic: raw.topic?.value,
      purpose: raw.purpose?.value,
      num_members: raw.num_members,
      is_private: raw.is_private,
      is_archived: raw.is_archived,
    },
    relatedEntityIds: [],
  };
}

function normalizeUser(raw: any, orgId: string): OrgEvent {
  const timestamp = raw.updated
    ? new Date(raw.updated * 1000).toISOString()
    : new Date().toISOString();

  return {
    id: makeEventId("slack", "user.active", raw.id || "", timestamp),
    orgId,
    source: "slack",
    eventType: "user.active",
    actorId: raw.id || "",
    actorName: raw.real_name || raw.name,
    entityType: "user",
    entityId: raw.id || "",
    entityName: raw.real_name || raw.name,
    timestamp,
    metadata: {
      email: raw.profile?.email,
      title: raw.profile?.title,
      is_bot: raw.is_bot,
      is_admin: raw.is_admin,
      tz: raw.tz,
    },
    relatedEntityIds: [],
  };
}
