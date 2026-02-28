import type { OrgEvent } from "../event-schema";
import { makeEventId } from "../event-schema";

/**
 * Normalize Linear API responses into OrgEvents.
 *
 * Handles: issues, teams, projects, cycles, labels, workflow states.
 */
export function normalizeLinear(
  rawRecords: any[],
  orgId: string,
  actionHint?: string,
): OrgEvent[] {
  const events: OrgEvent[] = [];

  for (const record of rawRecords) {
    if (!record || typeof record !== "object") continue;

    if (record.identifier || (record.title && record.state)) {
      // Linear issue
      events.push(normalizeIssue(record, orgId));
    } else if (record.key && record.members) {
      // Team
      events.push(normalizeTeam(record, orgId));
    } else if (record.startsAt && record.endsAt) {
      // Cycle
      events.push(normalizeCycle(record, orgId));
    } else if (record.name && record.slugId) {
      // Project
      events.push(normalizeProject(record, orgId));
    } else if (actionHint?.includes("ISSUE")) {
      events.push(normalizeIssue(record, orgId));
    }
  }

  return events;
}

function normalizeIssue(raw: any, orgId: string): OrgEvent {
  const state = raw.state?.name?.toLowerCase() || "unknown";
  const eventType =
    state === "done" || state === "completed" || state === "canceled"
      ? "issue.completed"
      : raw.createdAt === raw.updatedAt
        ? "issue.created"
        : "issue.updated";

  const timestamp = raw.updatedAt || raw.createdAt || new Date().toISOString();

  return {
    id: makeEventId("linear", eventType, raw.identifier || raw.id || "", timestamp),
    orgId,
    source: "linear",
    eventType,
    actorId: raw.creator?.id || raw.assignee?.id || "unknown",
    actorName: raw.creator?.name || raw.assignee?.name,
    entityType: "issue",
    entityId: raw.identifier || raw.id || "",
    entityName: raw.title,
    timestamp,
    metadata: {
      state: raw.state?.name,
      priority: raw.priority,
      priorityLabel: raw.priorityLabel,
      team: raw.team?.name || raw.team?.key,
      labels: raw.labels?.nodes?.map((l: any) => l.name),
      estimate: raw.estimate,
      dueDate: raw.dueDate,
      cycle: raw.cycle?.name,
    },
    relatedEntityIds: [
      ...(raw.project?.id ? [`linear:project:${raw.project.id}`] : []),
      ...(raw.cycle?.id ? [`linear:cycle:${raw.cycle.id}`] : []),
    ],
  };
}

function normalizeTeam(raw: any, orgId: string): OrgEvent {
  const timestamp = raw.updatedAt || raw.createdAt || new Date().toISOString();

  return {
    id: makeEventId("linear", "team.active", raw.id || raw.key || "", timestamp),
    orgId,
    source: "linear",
    eventType: "team.active",
    actorId: "system",
    entityType: "team",
    entityId: raw.id || raw.key || "",
    entityName: raw.name,
    timestamp,
    metadata: {
      key: raw.key,
      issueCount: raw.issueCount,
      memberCount: raw.members?.nodes?.length,
    },
    relatedEntityIds: [],
  };
}

function normalizeCycle(raw: any, orgId: string): OrgEvent {
  const now = new Date();
  const endDate = raw.endsAt ? new Date(raw.endsAt) : null;
  const eventType = endDate && endDate < now ? "cycle.completed" : "cycle.started";
  const timestamp = raw.updatedAt || raw.startsAt || new Date().toISOString();

  return {
    id: makeEventId("linear", eventType, raw.id || raw.number?.toString() || "", timestamp),
    orgId,
    source: "linear",
    eventType,
    actorId: "system",
    entityType: "cycle",
    entityId: raw.id || raw.number?.toString() || "",
    entityName: raw.name || `Cycle ${raw.number}`,
    timestamp,
    metadata: {
      number: raw.number,
      startsAt: raw.startsAt,
      endsAt: raw.endsAt,
      completedIssueCount: raw.completedIssueCountHistory,
      progress: raw.progress,
    },
    relatedEntityIds: [],
  };
}

function normalizeProject(raw: any, orgId: string): OrgEvent {
  const timestamp = raw.updatedAt || raw.createdAt || new Date().toISOString();

  return {
    id: makeEventId("linear", "project.updated", raw.id || raw.slugId || "", timestamp),
    orgId,
    source: "linear",
    eventType: "project.updated",
    actorId: raw.creator?.id || raw.lead?.id || "system",
    actorName: raw.creator?.name || raw.lead?.name,
    entityType: "project",
    entityId: raw.id || raw.slugId || "",
    entityName: raw.name,
    timestamp,
    metadata: {
      state: raw.state,
      progress: raw.progress,
      targetDate: raw.targetDate,
    },
    relatedEntityIds: [],
  };
}
