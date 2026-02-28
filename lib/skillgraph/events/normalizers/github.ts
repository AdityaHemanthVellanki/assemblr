import type { OrgEvent } from "../event-schema";
import { makeEventId } from "../event-schema";

/**
 * Normalize GitHub API responses into OrgEvents.
 *
 * Handles: commits, PRs, issues, repos.
 * Each Composio action returns a different shape — we dispatch based on
 * detectable keys in the raw data.
 */
export function normalizeGitHub(
  rawRecords: any[],
  orgId: string,
  actionHint?: string,
): OrgEvent[] {
  const events: OrgEvent[] = [];

  for (const record of rawRecords) {
    if (!record || typeof record !== "object") continue;

    // Detect record type from shape
    if (record.sha && record.commit) {
      // Git commit
      events.push(normalizeCommit(record, orgId));
    } else if (record.pull_request || (record.number && record.merged_at !== undefined)) {
      // Pull request
      events.push(normalizePR(record, orgId));
    } else if (record.number && record.title && !record.pull_request) {
      // Issue
      events.push(normalizeIssue(record, orgId));
    } else if (record.full_name && record.owner) {
      // Repository
      events.push(normalizeRepo(record, orgId));
    } else if (actionHint?.includes("COMMIT")) {
      events.push(normalizeCommit(record, orgId));
    } else if (actionHint?.includes("PULL_REQUEST") || actionHint?.includes("SEARCH_ISSUES")) {
      if (record.pull_request) {
        events.push(normalizePR(record, orgId));
      } else {
        events.push(normalizeIssue(record, orgId));
      }
    }
  }

  return events;
}

function normalizeCommit(raw: any, orgId: string): OrgEvent {
  const author = raw.commit?.author || raw.author || {};
  const timestamp =
    author.date || raw.commit?.committer?.date || new Date().toISOString();
  const repoName =
    raw.repository?.full_name ||
    raw.html_url?.match(/github\.com\/([^/]+\/[^/]+)/)?.[1] ||
    "unknown";

  return {
    id: makeEventId("github", "commit.created", raw.sha || raw.id || "", timestamp),
    orgId,
    source: "github",
    eventType: "commit.created",
    actorId: raw.author?.login || author.email || author.name || "unknown",
    actorName: author.name || raw.author?.login,
    entityType: "commit",
    entityId: raw.sha || raw.id || "",
    entityName: (raw.commit?.message || "").slice(0, 100),
    timestamp,
    metadata: {
      repo: repoName,
      message: raw.commit?.message,
      additions: raw.stats?.additions,
      deletions: raw.stats?.deletions,
    },
    relatedEntityIds: [],
  };
}

function normalizePR(raw: any, orgId: string): OrgEvent {
  const state = raw.merged_at
    ? "merged"
    : raw.state === "closed"
      ? "closed"
      : "opened";
  const timestamp =
    raw.merged_at || raw.closed_at || raw.updated_at || raw.created_at || new Date().toISOString();
  const repoName =
    raw.base?.repo?.full_name ||
    raw.repository?.full_name ||
    raw.html_url?.match(/github\.com\/([^/]+\/[^/]+)/)?.[1] ||
    "unknown";

  return {
    id: makeEventId("github", `pr.${state}`, String(raw.number || raw.id || ""), timestamp),
    orgId,
    source: "github",
    eventType: `pr.${state}`,
    actorId: raw.user?.login || "unknown",
    actorName: raw.user?.login,
    entityType: "pull_request",
    entityId: String(raw.number || raw.id || ""),
    entityName: raw.title,
    timestamp,
    metadata: {
      repo: repoName,
      state: raw.state,
      additions: raw.additions,
      deletions: raw.deletions,
      reviewers: raw.requested_reviewers?.map((r: any) => r.login),
    },
    relatedEntityIds: [],
  };
}

function normalizeIssue(raw: any, orgId: string): OrgEvent {
  const state = raw.state === "closed" ? "closed" : raw.created_at === raw.updated_at ? "created" : "updated";
  const timestamp = raw.updated_at || raw.created_at || new Date().toISOString();
  const repoName =
    raw.repository?.full_name ||
    raw.html_url?.match(/github\.com\/([^/]+\/[^/]+)/)?.[1] ||
    "unknown";

  return {
    id: makeEventId("github", `issue.${state}`, String(raw.number || raw.id || ""), timestamp),
    orgId,
    source: "github",
    eventType: `issue.${state}`,
    actorId: raw.user?.login || "unknown",
    actorName: raw.user?.login,
    entityType: "issue",
    entityId: String(raw.number || raw.id || ""),
    entityName: raw.title,
    timestamp,
    metadata: {
      repo: repoName,
      state: raw.state,
      labels: raw.labels?.map((l: any) => l.name),
      assignees: raw.assignees?.map((a: any) => a.login),
    },
    relatedEntityIds: [],
  };
}

function normalizeRepo(raw: any, orgId: string): OrgEvent {
  const timestamp = raw.updated_at || raw.created_at || new Date().toISOString();

  return {
    id: makeEventId("github", "repo.updated", raw.full_name || raw.id || "", timestamp),
    orgId,
    source: "github",
    eventType: "repo.updated",
    actorId: raw.owner?.login || "unknown",
    actorName: raw.owner?.login,
    entityType: "repo",
    entityId: raw.full_name || String(raw.id || ""),
    entityName: raw.full_name || raw.name,
    timestamp,
    metadata: {
      language: raw.language,
      stars: raw.stargazers_count,
      forks: raw.forks_count,
      open_issues: raw.open_issues_count,
      private: raw.private,
    },
    relatedEntityIds: [],
  };
}
