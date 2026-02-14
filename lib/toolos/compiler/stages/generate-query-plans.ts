import type { ToolCompilerStageContext, ToolCompilerStageResult } from "@/lib/toolos/compiler/tool-compiler";
import type { IntegrationQueryPlan } from "@/lib/toolos/spec";

/**
 * Deterministic compiler stage: Generate query plans from user prompt.
 *
 * Parses temporal constraints ("last 7 days", "this week", "since January"),
 * entity constraints ("repo X", "channel #general"), and limit hints from the
 * prompt text. Maps them to integration-specific API parameters so that
 * `buildReadActionInput()` sends the correct filters to Composio.
 *
 * No LLM call — pure deterministic parsing.
 */
export async function runGenerateQueryPlans(
  ctx: ToolCompilerStageContext,
): Promise<ToolCompilerStageResult> {
  const readActions = ctx.spec.actions.filter((a) => a.type === "READ");
  if (readActions.length === 0) {
    return {};
  }

  const temporal = parseTemporalConstraints(ctx.prompt);
  const limitHint = parseLimitHint(ctx.prompt);
  const entityConstraints = parseEntityConstraints(ctx.prompt);

  const queryPlans: IntegrationQueryPlan[] = [];

  for (const action of readActions) {
    const query: Record<string, any> = {};

    // Apply temporal filters mapped to integration-specific params
    if (temporal) {
      const mapping = getTemporalFieldMapping(action.integrationId, action.capabilityId);
      if (mapping) {
        if (mapping.format === "iso8601") {
          if (temporal.since) query[mapping.sinceField] = temporal.since;
          if (temporal.until) query[mapping.untilField] = temporal.until;
        } else if (mapping.format === "unix") {
          if (temporal.since) query[mapping.sinceField] = Math.floor(new Date(temporal.since).getTime() / 1000).toString();
          if (temporal.until) query[mapping.untilField] = Math.floor(new Date(temporal.until).getTime() / 1000).toString();
        } else if (mapping.format === "gmail_query") {
          const parts: string[] = [];
          if (temporal.since) parts.push(`after:${temporal.since.split("T")[0].replace(/-/g, "/")}`);
          if (temporal.until) parts.push(`before:${temporal.until.split("T")[0].replace(/-/g, "/")}`);
          if (parts.length > 0) {
            query[mapping.sinceField] = parts.join(" ");
          }
        } else if (mapping.format === "notion_filter") {
          if (temporal.since) {
            query.filter = {
              timestamp: "last_edited_time",
              last_edited_time: { on_or_after: temporal.since },
            };
          }
        }
      }
    }

    // Apply entity-specific constraints (repo name, channel, etc.)
    const entityParams = getEntityConstraintParams(action.integrationId, action.capabilityId, entityConstraints);
    Object.assign(query, entityParams);

    // Apply limit
    const limit = limitHint ?? getDefaultLimit(action.integrationId, action.capabilityId, !!temporal);
    if (limit) {
      query.limit = limit;
      // Some integrations use different param names for limit
      if (action.integrationId === "google" && action.capabilityId.startsWith("google_gmail")) {
        query.max_results = limit;
      }
      if (action.integrationId === "notion") {
        query.page_size = limit;
      }
    }

    if (Object.keys(query).length > 0) {
      queryPlans.push({
        integrationId: action.integrationId,
        actionId: action.id,
        query,
        fields: [],
      });
    }
  }

  if (queryPlans.length === 0) {
    return {};
  }

  console.log(`[QueryPlans] Generated ${queryPlans.length} query plans from prompt`, queryPlans.map((p) => ({ action: p.actionId, query: p.query })));
  return { specPatch: { query_plans: queryPlans } };
}

// ─── Temporal Parsing ────────────────────────────────────────

export type TemporalRange = {
  since: string | null; // ISO 8601
  until: string | null; // ISO 8601
};

export function parseTemporalConstraints(prompt: string): TemporalRange | null {
  const lower = prompt.toLowerCase();
  const now = new Date();

  // "last N days/weeks/months/hours"
  const lastNMatch = lower.match(/(?:last|past|previous)\s+(\d+)\s+(day|week|month|hour|minute)s?/);
  if (lastNMatch) {
    const n = parseInt(lastNMatch[1], 10);
    const unit = lastNMatch[2];
    const since = subtractFromDate(now, n, unit);
    return { since: since.toISOString(), until: now.toISOString() };
  }

  // "this week" / "this month" / "this year"
  const thisMatch = lower.match(/\bthis\s+(week|month|year)\b/);
  if (thisMatch) {
    const unit = thisMatch[1];
    const since = getStartOf(now, unit);
    return { since: since.toISOString(), until: now.toISOString() };
  }

  // "today"
  if (/\btoday\b/.test(lower)) {
    const since = new Date(now);
    since.setHours(0, 0, 0, 0);
    return { since: since.toISOString(), until: now.toISOString() };
  }

  // "yesterday"
  if (/\byesterday\b/.test(lower)) {
    const since = new Date(now);
    since.setDate(since.getDate() - 1);
    since.setHours(0, 0, 0, 0);
    const until = new Date(now);
    until.setHours(0, 0, 0, 0);
    return { since: since.toISOString(), until: until.toISOString() };
  }

  // "since <date>" — e.g., "since January", "since Jan 1", "since 2025-01-01"
  const sinceMatch = lower.match(/\bsince\s+(.+?)(?:\.|,|$)/);
  if (sinceMatch) {
    const parsed = parseDateString(sinceMatch[1].trim(), now);
    if (parsed) {
      return { since: parsed.toISOString(), until: now.toISOString() };
    }
  }

  // "from <date> to <date>"
  const fromToMatch = lower.match(/\bfrom\s+(.+?)\s+to\s+(.+?)(?:\.|,|$)/);
  if (fromToMatch) {
    const from = parseDateString(fromToMatch[1].trim(), now);
    const to = parseDateString(fromToMatch[2].trim(), now);
    if (from) {
      return { since: from.toISOString(), until: to?.toISOString() ?? now.toISOString() };
    }
  }

  // "in the last week" / "in the past month" (without N)
  const inTheLastMatch = lower.match(/\bin\s+the\s+(?:last|past)\s+(week|month|year|day)\b/);
  if (inTheLastMatch) {
    const unit = inTheLastMatch[1];
    const since = subtractFromDate(now, 1, unit);
    return { since: since.toISOString(), until: now.toISOString() };
  }

  // "recent" — default to last 7 days
  if (/\brecent\b/.test(lower)) {
    const since = subtractFromDate(now, 7, "day");
    return { since: since.toISOString(), until: now.toISOString() };
  }

  return null;
}

function subtractFromDate(date: Date, n: number, unit: string): Date {
  const result = new Date(date);
  switch (unit) {
    case "minute":
      result.setMinutes(result.getMinutes() - n);
      break;
    case "hour":
      result.setHours(result.getHours() - n);
      break;
    case "day":
      result.setDate(result.getDate() - n);
      break;
    case "week":
      result.setDate(result.getDate() - n * 7);
      break;
    case "month":
      result.setMonth(result.getMonth() - n);
      break;
    case "year":
      result.setFullYear(result.getFullYear() - n);
      break;
  }
  return result;
}

function getStartOf(date: Date, unit: string): Date {
  const result = new Date(date);
  if (unit === "week") {
    const day = result.getDay();
    result.setDate(result.getDate() - day);
    result.setHours(0, 0, 0, 0);
  } else if (unit === "month") {
    result.setDate(1);
    result.setHours(0, 0, 0, 0);
  } else if (unit === "year") {
    result.setMonth(0, 1);
    result.setHours(0, 0, 0, 0);
  }
  return result;
}

const MONTH_NAMES: Record<string, number> = {
  january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2,
  april: 3, apr: 3, may: 4, june: 5, jun: 5, july: 6, jul: 6,
  august: 7, aug: 7, september: 8, sep: 8, sept: 8, october: 9, oct: 9,
  november: 10, nov: 10, december: 11, dec: 11,
};

function parseDateString(str: string, now: Date): Date | null {
  // ISO-ish: "2025-01-15"
  const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
  }

  // "Jan 15" / "January 15" / "Jan 15, 2025"
  const monthDayMatch = str.match(/^(\w+)\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?/);
  if (monthDayMatch) {
    const monthNum = MONTH_NAMES[monthDayMatch[1].toLowerCase()];
    if (monthNum !== undefined) {
      const year = monthDayMatch[3] ? parseInt(monthDayMatch[3]) : now.getFullYear();
      return new Date(year, monthNum, parseInt(monthDayMatch[2]));
    }
  }

  // Just a month name: "January" → start of that month this year
  const monthOnly = MONTH_NAMES[str.toLowerCase()];
  if (monthOnly !== undefined) {
    return new Date(now.getFullYear(), monthOnly, 1);
  }

  return null;
}

// ─── Limit Parsing ───────────────────────────────────────────

function parseLimitHint(prompt: string): number | null {
  const lower = prompt.toLowerCase();

  // "top N" / "first N" / "latest N" / "last N items" / "show N commits"
  const topNMatch = lower.match(/(?:top|first|latest|show|get|fetch|display)\s+(\d+)\s/);
  if (topNMatch) {
    const n = parseInt(topNMatch[1], 10);
    if (n >= 1 && n <= 500) return n;
  }

  // "limit to N" / "limit N"
  const limitMatch = lower.match(/\blimit\s+(?:to\s+)?(\d+)\b/);
  if (limitMatch) {
    const n = parseInt(limitMatch[1], 10);
    if (n >= 1 && n <= 500) return n;
  }

  return null;
}

// ─── Entity Constraint Parsing ───────────────────────────────

type EntityConstraints = {
  repos: string[];    // "owner/repo" or just "repo"
  channels: string[]; // "#channel" or "channel"
  projects: string[]; // Linear/Jira project names
};

function parseEntityConstraints(prompt: string): EntityConstraints {
  const repos: string[] = [];
  const channels: string[] = [];
  const projects: string[] = [];

  // GitHub repos: "owner/repo" pattern
  const repoMatches = prompt.match(/\b([\w.-]+\/[\w.-]+)\b/g);
  if (repoMatches) {
    for (const match of repoMatches) {
      // Filter out common false positives
      if (!match.includes("http") && !match.match(/^\d+\/\d+$/)) {
        repos.push(match);
      }
    }
  }

  // Slack channels: "#channel-name"
  const channelMatches = prompt.match(/#([\w-]+)/g);
  if (channelMatches) {
    for (const match of channelMatches) {
      channels.push(match.replace("#", ""));
    }
  }

  // "repo <name>" / "repository <name>"
  const repoNameMatch = prompt.match(/\b(?:repo|repository)\s+["']?([\w.-]+(?:\/[\w.-]+)?)["']?/i);
  if (repoNameMatch && !repos.includes(repoNameMatch[1])) {
    repos.push(repoNameMatch[1]);
  }

  // "channel <name>"
  const channelNameMatch = prompt.match(/\b(?:channel)\s+["']?#?([\w-]+)["']?/i);
  if (channelNameMatch && !channels.includes(channelNameMatch[1])) {
    channels.push(channelNameMatch[1]);
  }

  // "project <name>"
  const projectNameMatch = prompt.match(/\b(?:project)\s+["']?([\w\s-]+?)["']?(?:\s+(?:in|on|from|for)|$|,)/i);
  if (projectNameMatch) {
    projects.push(projectNameMatch[1].trim());
  }

  return { repos, channels, projects };
}

function getEntityConstraintParams(
  integrationId: string,
  capabilityId: string,
  constraints: EntityConstraints,
): Record<string, any> {
  const params: Record<string, any> = {};

  if (integrationId === "github" && constraints.repos.length > 0) {
    const repo = constraints.repos[0];
    const parts = repo.split("/");
    if (parts.length === 2) {
      params.owner = parts[0];
      params.repo = parts[1];
    }
  }

  if (integrationId === "slack" && constraints.channels.length > 0) {
    params.channel = constraints.channels[0];
  }

  if (integrationId === "linear" && constraints.projects.length > 0) {
    params.project_name = constraints.projects[0];
  }

  return params;
}

// ─── Integration-Specific Temporal Field Mapping ─────────────

type TemporalFieldMapping = {
  sinceField: string;
  untilField: string;
  format: "iso8601" | "unix" | "gmail_query" | "notion_filter";
};

function getTemporalFieldMapping(integrationId: string, capabilityId: string): TemporalFieldMapping | null {
  // GitHub
  if (integrationId === "github") {
    if (capabilityId.includes("commit")) {
      return { sinceField: "since", untilField: "until", format: "iso8601" };
    }
    if (capabilityId.includes("issue") || capabilityId.includes("pull")) {
      return { sinceField: "since", untilField: "until", format: "iso8601" };
    }
    // Repos don't have temporal filters
    return null;
  }

  // Slack
  if (integrationId === "slack") {
    return { sinceField: "oldest", untilField: "latest", format: "unix" };
  }

  // Linear
  if (integrationId === "linear") {
    return { sinceField: "createdAfter", untilField: "createdBefore", format: "iso8601" };
  }

  // Notion
  if (integrationId === "notion") {
    return { sinceField: "filter", untilField: "filter", format: "notion_filter" };
  }

  // Google (Gmail)
  if (integrationId === "google") {
    if (capabilityId.includes("gmail")) {
      return { sinceField: "query", untilField: "query", format: "gmail_query" };
    }
    if (capabilityId.includes("calendar")) {
      return { sinceField: "timeMin", untilField: "timeMax", format: "iso8601" };
    }
    return null;
  }

  // Jira
  if (integrationId === "jira") {
    return { sinceField: "jql_since", untilField: "jql_until", format: "iso8601" };
  }

  // GitLab
  if (integrationId === "gitlab") {
    return { sinceField: "since", untilField: "until", format: "iso8601" };
  }

  // HubSpot
  if (integrationId === "hubspot") {
    return { sinceField: "after", untilField: "before", format: "iso8601" };
  }

  return null;
}

// ─── Default Limits ──────────────────────────────────────────

function getDefaultLimit(integrationId: string, capabilityId: string, hasTemporalFilter: boolean): number {
  // When we have temporal filters, increase limits significantly
  // since the date range already scopes the results
  if (hasTemporalFilter) {
    if (integrationId === "github") return 100;
    if (integrationId === "slack") return 100;
    if (integrationId === "linear") return 50;
    if (integrationId === "notion") return 50;
    if (integrationId === "google") return 50;
    return 50;
  }

  // Without temporal filters, use moderate defaults
  if (integrationId === "github") {
    if (capabilityId.includes("repos")) return 30;
    return 30;
  }
  if (integrationId === "slack") return 30;
  if (integrationId === "linear") return 30;
  if (integrationId === "notion") return 30;
  if (integrationId === "google") return 20;
  return 20;
}
