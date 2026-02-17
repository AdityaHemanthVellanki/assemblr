import { ToolSystemSpec, ViewSpec } from "@/lib/toolos/spec";
import { type SnapshotRecords } from "@/lib/toolos/materialization";
import { extractPayloadArray } from "@/lib/integrations/composio/execution";

export type ViewProjection = {
  id: string;
  name: string;
  type: ViewSpec["type"];
  data: any;
  actions: string[];
};

export type DefaultViewItem = {
  source: string;
  count: number;
};

export type DefaultViewSpec = {
  type: "dashboard";
  title: string;
  sections: Array<{
    type: "list";
    title: string;
    items: DefaultViewItem[];
  }>;
};

export function renderView(spec: ToolSystemSpec, state: Record<string, any>, viewId: string): ViewProjection {
  const view = spec.views.find((v) => v.id === viewId);
  if (!view) {
    throw new Error(`View ${viewId} not found`);
  }
  let data = resolveStatePath(state, view.source.statePath);

  // Ensure data is an array for list-type views (table, kanban, timeline)
  if (data !== null && data !== undefined && !Array.isArray(data)) {
    data = extractPayloadArray(data);
  }

  // Flatten nested objects to match view field names
  if (Array.isArray(data) && data.length > 0 && view.fields?.length > 0) {
    data = data.map((row: any) => flattenForView(row, view.fields));
  }

  return {
    id: view.id,
    name: view.name,
    type: view.type,
    data,
    actions: view.actions,
  };
}

export function buildDefaultViewSpec(records?: SnapshotRecords | null): DefaultViewSpec {
  const items: DefaultViewItem[] = [];
  const integrations = records?.integrations ?? {};
  const actions = records?.actions ?? {};
  const sources = Object.keys(integrations).length > 0 ? integrations : actions;

  for (const [source, output] of Object.entries(sources)) {
    let count = 0;
    if (Array.isArray(output)) {
      count = output.length;
    } else if (output && typeof output === "object") {
      const values = Object.values(output as Record<string, any>);
      count = values.reduce((sum, value) => sum + (Array.isArray(value) ? value.length : value ? 1 : 0), 0);
    } else if (output !== null && output !== undefined) {
      count = 1;
    }
    items.push({ source, count });
  }

  return {
    type: "dashboard",
    title: "Assemblr Tool Output",
    sections: [
      {
        type: "list",
        title: "Fetched Data",
        items,
      },
    ],
  };
}

function resolveStatePath(state: Record<string, any>, path: string) {
  const parts = path.split(".");
  let current: any = state;
  for (const part of parts) {
    if (current == null) return null;
    current = current[part];
  }
  return current ?? null;
}

/**
 * Flatten a nested data row to match the expected view field names.
 *
 * Many API responses have nested structures (e.g., GitHub commits: commit.message, commit.author.name).
 * Views define flat field names (message, author, date, sha).
 * This function resolves each field by:
 *   1. Direct key match (row.message)
 *   2. Deep search through nested objects for matching keys
 *   3. Common nested path patterns (commit.message, author.login, etc.)
 */
function flattenForView(row: any, fields: string[]): Record<string, any> {
  if (!row || typeof row !== "object") return row;

  const result: Record<string, any> = {};
  for (const field of fields) {
    const normalized = field.toLowerCase();

    // 1. Direct key match
    if (row[field] !== undefined && row[field] !== null && typeof row[field] !== "object") {
      result[field] = row[field];
      continue;
    }
    if (row[normalized] !== undefined && row[normalized] !== null && typeof row[normalized] !== "object") {
      result[field] = row[normalized];
      continue;
    }

    // 2. Smart resolution for common patterns
    const resolved = resolveFieldSmart(row, normalized);
    if (resolved !== undefined) {
      result[field] = resolved;
      continue;
    }

    // 3. Deep search
    const deepResult = deepFindValue(row, normalized, 0);
    if (deepResult !== undefined) {
      result[field] = deepResult;
      continue;
    }

    // 4. Keep original value even if it's an object (will be stringified by UI)
    if (row[field] !== undefined) {
      result[field] = typeof row[field] === "object" ? JSON.stringify(row[field]) : row[field];
    } else if (row[normalized] !== undefined) {
      result[field] = typeof row[normalized] === "object" ? JSON.stringify(row[normalized]) : row[normalized];
    }
  }

  return result;
}

/**
 * Smart field resolution for common API response patterns.
 */
function resolveFieldSmart(row: any, field: string): any {
  // GitHub commit patterns
  if (field === "message" && row.commit?.message) return row.commit.message;
  if (field === "author" && row.commit?.author?.name) return row.commit.author.name;
  if (field === "author" && row.author?.login) return row.author.login;
  if (field === "date" && row.commit?.author?.date) return formatDate(row.commit.author.date);
  if (field === "date" && row.commit?.committer?.date) return formatDate(row.commit.committer.date);
  if (field === "repository" && row.html_url) {
    // Extract repo name from commit URL: https://github.com/owner/repo/commit/sha
    const match = row.html_url.match(/github\.com\/([^/]+\/[^/]+)/);
    return match ? match[1] : undefined;
  }
  if (field === "sha" && row.sha) return row.sha.substring(0, 7);

  // GitHub issue/PR patterns
  if (field === "title" && row.title) return row.title;
  if (field === "status" && row.state) return row.state;
  if (field === "assignee" && row.assignee?.login) return row.assignee.login;
  if (field === "labels" && Array.isArray(row.labels)) return row.labels.map((l: any) => l.name ?? l).join(", ");
  if (field === "created" && row.created_at) return formatDate(row.created_at);
  if (field === "updated" && row.updated_at) return formatDate(row.updated_at);

  // Slack patterns
  if (field === "text" && row.text) return row.text;
  if (field === "user" && row.user) return typeof row.user === "string" ? row.user : row.user?.name ?? row.user?.real_name;
  if (field === "channel" && row.channel?.name) return row.channel.name;
  if (field === "timestamp" && row.ts) return formatDate(new Date(Number(row.ts) * 1000).toISOString());

  // Linear patterns
  if (field === "priority" && row.priority !== undefined) {
    const priorities = ["None", "Urgent", "High", "Medium", "Low"];
    return priorities[row.priority] ?? String(row.priority);
  }

  // Notion patterns
  if (field === "name" && row.properties?.Name?.title?.[0]?.plain_text) return row.properties.Name.title[0].plain_text;
  if (field === "name" && row.properties?.title?.title?.[0]?.plain_text) return row.properties.title.title[0].plain_text;

  // Stripe patterns
  if (field === "amount" && row.amount != null) return (row.amount / 100).toFixed(2);
  if (field === "amountdue" && row.amount_due != null) return (row.amount_due / 100).toFixed(2);
  if (field === "currency" && row.currency) return row.currency.toUpperCase();
  if (field === "customer" && row.customer) return typeof row.customer === "string" ? row.customer : row.customer?.email ?? row.customer?.id;
  if (field === "plan" && row.plan?.nickname) return row.plan.nickname;
  if (field === "plan" && row.items?.data?.[0]?.price?.nickname) return row.items.data[0].price.nickname;
  if (field === "currentperiodend" && row.current_period_end) return formatDate(new Date(row.current_period_end * 1000).toISOString());
  if (field === "duedate" && row.due_date) return formatDate(new Date(row.due_date * 1000).toISOString());

  // HubSpot patterns
  if (field === "firstname" && row.properties?.firstname) return row.properties.firstname;
  if (field === "lastname" && row.properties?.lastname) return row.properties.lastname;
  if (field === "email" && row.properties?.email) return row.properties.email;
  if (field === "phone" && row.properties?.phone) return row.properties.phone;
  if (field === "dealname" && row.properties?.dealname) return row.properties.dealname;
  if (field === "dealstage" && row.properties?.dealstage) return row.properties.dealstage;
  if (field === "pipeline" && row.properties?.pipeline) return row.properties.pipeline;
  if (field === "closedate" && row.properties?.closedate) return formatDate(row.properties.closedate);
  if (field === "createdate" && row.properties?.createdate) return formatDate(row.properties.createdate);
  if (field === "domain" && row.properties?.domain) return row.properties.domain;
  if (field === "industry" && row.properties?.industry) return row.properties.industry;
  if (field === "annualrevenue" && row.properties?.annualrevenue) return row.properties.annualrevenue;

  // Outlook patterns
  if (field === "subject" && row.subject) return row.subject;
  if (field === "from" && row.from?.emailAddress?.address) return row.from.emailAddress.address;
  if (field === "from" && row.from?.emailAddress?.name) return row.from.emailAddress.name;
  if (field === "receiveddatetime" && row.receivedDateTime) return formatDate(row.receivedDateTime);
  if (field === "bodypreview" && row.bodyPreview) return row.bodyPreview;
  if (field === "isread" && typeof row.isRead === "boolean") return row.isRead ? "Read" : "Unread";
  if (field === "organizer" && row.organizer?.emailAddress?.name) return row.organizer.emailAddress.name;
  if (field === "location" && row.location?.displayName) return row.location.displayName;
  if (field === "start" && row.start?.dateTime) return formatDate(row.start.dateTime);
  if (field === "end" && row.end?.dateTime) return formatDate(row.end.dateTime);

  // Zoom patterns
  if (field === "topic" && row.topic) return row.topic;
  if (field === "starttime" && row.start_time) return formatDate(row.start_time);
  if (field === "duration" && row.duration) return `${row.duration} min`;
  if (field === "joinurl" && row.join_url) return row.join_url;

  // Trello patterns
  if (field === "listname" && row.list?.name) return row.list.name;
  if (field === "due" && row.due) return formatDate(row.due);
  if (field === "datelastactivity" && row.dateLastActivity) return formatDate(row.dateLastActivity);

  // Asana patterns
  if (field === "assignee" && row.assignee?.name) return row.assignee.name;
  if (field === "dueon" && row.due_on) return formatDate(row.due_on);
  if (field === "completed" && typeof row.completed === "boolean") return row.completed ? "Done" : "In Progress";
  if (field === "section" && row.memberships?.[0]?.section?.name) return row.memberships[0].section.name;
  if (field === "projects" && Array.isArray(row.projects)) return row.projects.map((p: any) => p.name).join(", ");

  // GitLab patterns
  if (field === "weburl" && row.web_url) return row.web_url;
  if (field === "lastactivityat" && row.last_activity_at) return formatDate(row.last_activity_at);
  if (field === "authorname" && row.author_name) return row.author_name;
  if (field === "targetbranch" && row.target_branch) return row.target_branch;
  if (field === "createdat" && row.created_at) return formatDate(row.created_at);
  if (field === "updatedat" && row.updated_at) return formatDate(row.updated_at);

  // Intercom patterns
  if (field === "state" && row.state) return row.state;
  if (field === "role" && row.role) return row.role;

  // ClickUp patterns
  if (field === "priority" && row.priority?.priority) return row.priority.priority;
  if (field === "list" && row.list?.name) return row.list.name;
  if (field === "assignees" && Array.isArray(row.assignees)) return row.assignees.map((a: any) => a.username ?? a.email).join(", ");
  if (field === "duedate" && row.due_date) return formatDate(new Date(Number(row.due_date)).toISOString());

  // Microsoft Teams patterns
  if (field === "body" && row.body?.content) return row.body.content.replace(/<[^>]*>/g, "").substring(0, 200);
  if (field === "from" && row.from?.user?.displayName) return row.from.user.displayName;
  if (field === "createddatetime" && row.createdDateTime) return formatDate(row.createdDateTime);
  if (field === "displayname" && row.displayName) return row.displayName;
  if (field === "membershiptype" && row.membershipType) return row.membershipType;

  // Airtable patterns
  if (field === "name" && row.fields?.Name) return row.fields.Name;
  if (field === "notes" && row.fields?.Notes) return row.fields.Notes;

  // Bitbucket patterns
  if (field === "fullname" && row.full_name) return row.full_name;
  if (field === "slug" && row.slug) return row.slug;
  if (field === "sourcebranch" && row.source?.branch?.name) return row.source.branch.name;
  if (field === "destinationbranch" && row.destination?.branch?.name) return row.destination.branch.name;

  // QuickBooks patterns
  if (field === "accounttype" && row.AccountType) return row.AccountType;
  if (field === "currentbalance" && row.CurrentBalance != null) return row.CurrentBalance.toFixed(2);
  if (field === "displayname" && row.DisplayName) return row.DisplayName;
  if (field === "companyname" && row.CompanyName) return row.CompanyName;
  if (field === "balance" && row.Balance != null) return row.Balance.toFixed(2);

  // Generic patterns
  if (field === "name" && row.name) return row.name;
  if (field === "description" && row.description) return row.description;
  if (field === "url" && row.html_url) return row.html_url;
  if (field === "url" && row.url) return row.url;
  if (field === "id" && row.id) return row.id;
  if (field === "email" && row.email) return row.email;
  if (field === "status" && row.status) return row.status;
  if (field === "created" && row.created) return formatDate(typeof row.created === "number" ? new Date(row.created * 1000).toISOString() : row.created);

  return undefined;
}

function deepFindValue(obj: any, key: string, depth: number): any {
  if (depth > 3 || !obj || typeof obj !== "object") return undefined;
  if (Array.isArray(obj)) return undefined;

  for (const [k, v] of Object.entries(obj)) {
    if (k.toLowerCase() === key && v !== null && v !== undefined && typeof v !== "object") {
      return v;
    }
  }
  // Go one level deeper
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const found = deepFindValue(v, key, depth + 1);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}
