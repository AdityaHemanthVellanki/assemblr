import { ToolSystemSpec, ViewSpec } from "@/lib/toolos/spec";
import { type SnapshotRecords } from "@/lib/toolos/materialization";
import { extractPayloadArray } from "@/lib/integrations/composio/execution";

export type KpiMetric = {
  label: string;
  value: string | number;
  type: "count" | "percentage" | "currency" | "text";
  trend?: "up" | "down" | "neutral";
  color?: "green" | "red" | "amber" | "blue" | "neutral";
};

export type DataInsights = {
  kpis: KpiMetric[];
  summary: string;
  dataQuality: {
    totalRecords: number;
    populatedFields: number;
    totalFields: number;
    completeness: number; // 0-1
  };
  fieldMeta: Record<string, {
    displayName: string;
    type: "text" | "number" | "date" | "status" | "url" | "email" | "boolean" | "currency" | "unknown";
    nullCount: number;
    uniqueCount: number;
  }>;
};

export type ViewProjection = {
  id: string;
  name: string;
  type: ViewSpec["type"];
  data: any;
  actions: string[];
  insights?: DataInsights;
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

  // Diagnostic: log actual data shape for debugging field resolution
  if (Array.isArray(data) && data.length > 0) {
    const sample = data[0];
    console.log("[renderView]", {
      viewId,
      viewFields: view.fields,
      statePath: view.source.statePath,
      rowCount: data.length,
      sampleKeys: sample && typeof sample === "object" ? Object.keys(sample).slice(0, 20) : typeof sample,
      sampleNested: sample && typeof sample === "object"
        ? Object.fromEntries(
            Object.entries(sample).slice(0, 5).map(([k, v]) =>
              [k, v && typeof v === "object" && !Array.isArray(v) ? `{${Object.keys(v as object).slice(0, 5).join(",")}}` : typeof v]
            )
          )
        : null,
    });
  }

  // Flatten nested objects to match view field names
  if (Array.isArray(data) && data.length > 0 && view.fields?.length > 0) {
    data = data.map((row: any) => flattenForView(row, view.fields));
  }

  // Extract data insights for the UI
  const insights = Array.isArray(data) && data.length > 0
    ? extractDataInsights(data, view, spec)
    : undefined;

  return {
    id: view.id,
    name: view.name,
    type: view.type,
    data,
    actions: view.actions,
    insights,
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

/**
 * Extract data insights from materialized records.
 * Auto-detects KPIs, field metadata, and data quality metrics.
 */
function extractDataInsights(rows: any[], view: ViewSpec, spec: ToolSystemSpec): DataInsights {
  const fields = view.fields?.length > 0 ? view.fields : Object.keys(rows[0] ?? {});
  const totalRecords = rows.length;

  // Build field metadata
  const fieldMeta: DataInsights["fieldMeta"] = {};
  let populatedCells = 0;
  let totalCells = 0;

  for (const field of fields) {
    const values = rows.map((r) => r[field]);
    const nonNull = values.filter((v) => v !== null && v !== undefined && v !== "");
    const uniqueValues = new Set(nonNull.map((v) => String(v)));

    fieldMeta[field] = {
      displayName: getFieldDisplayName(field, spec),
      type: inferFieldType(field, nonNull),
      nullCount: totalRecords - nonNull.length,
      uniqueCount: uniqueValues.size,
    };

    populatedCells += nonNull.length;
    totalCells += totalRecords;
  }

  const completeness = totalCells > 0 ? populatedCells / totalCells : 0;

  // Auto-extract KPIs
  const kpis = extractKpis(rows, fields, fieldMeta, spec);

  // Generate summary
  const summary = generateSummary(rows, fields, fieldMeta, spec, view);

  return {
    kpis,
    summary,
    dataQuality: {
      totalRecords,
      populatedFields: Object.values(fieldMeta).filter((m) => m.nullCount < totalRecords).length,
      totalFields: fields.length,
      completeness: Math.round(completeness * 100) / 100,
    },
    fieldMeta,
  };
}

function getFieldDisplayName(field: string, spec: ToolSystemSpec): string {
  // Check if entity fields have displayName
  for (const entity of spec.entities) {
    const entityField = entity.fields.find((f) => f.name === field);
    if (entityField && (entityField as any).displayName) {
      return (entityField as any).displayName;
    }
  }
  // Fallback: humanize the field name
  const MAP: Record<string, string> = {
    id: "ID", url: "URL", html_url: "Link", created_at: "Created",
    updated_at: "Updated", closed_at: "Closed", merged_at: "Merged",
    due_on: "Due Date", full_name: "Full Name", assignee: "Assigned To",
    sha: "Commit SHA", bodyPreview: "Preview", isRead: "Read Status",
  };
  if (MAP[field]) return MAP[field];
  return field
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function inferFieldType(field: string, values: any[]): DataInsights["fieldMeta"][string]["type"] {
  const lower = field.toLowerCase();

  // By field name
  if (lower.includes("status") || lower.includes("state") || lower === "priority") return "status";
  if (lower.includes("email") || lower.includes("mail")) return "email";
  if (lower.includes("url") || lower.includes("link") || lower.includes("href")) return "url";
  if (lower.includes("amount") || lower.includes("price") || lower.includes("cost") || lower.includes("revenue") || lower.includes("balance")) return "currency";
  if (lower.includes("date") || lower.includes("time") || lower.includes("_at") || lower.includes("created") || lower.includes("updated")) return "date";

  // By value type
  if (values.length === 0) return "unknown";
  const sample = values[0];
  if (typeof sample === "boolean") return "boolean";
  if (typeof sample === "number") return "number";
  if (typeof sample === "string") {
    if (sample.startsWith("http://") || sample.startsWith("https://")) return "url";
    if (sample.includes("@") && sample.includes(".")) return "email";
    const d = new Date(sample);
    if (!isNaN(d.getTime()) && sample.length > 8) return "date";
  }
  return "text";
}

function extractKpis(
  rows: any[],
  fields: string[],
  fieldMeta: DataInsights["fieldMeta"],
  spec: ToolSystemSpec,
): KpiMetric[] {
  const kpis: KpiMetric[] = [];

  // 1. Total record count
  kpis.push({
    label: "Total Records",
    value: rows.length,
    type: "count",
    color: "blue",
  });

  // 2. Status distribution KPIs
  const statusFields = fields.filter((f) => fieldMeta[f]?.type === "status");
  for (const statusField of statusFields.slice(0, 1)) {
    const counts: Record<string, number> = {};
    for (const row of rows) {
      const val = String(row[statusField] ?? "Unknown").toLowerCase();
      counts[val] = (counts[val] ?? 0) + 1;
    }

    // Find most common status
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      const [topStatus, topCount] = sorted[0];
      const label = fieldMeta[statusField]?.displayName || statusField;
      kpis.push({
        label: `${capitalize(topStatus)}`,
        value: topCount,
        type: "count",
        color: getStatusColor(topStatus),
      });

      // If there are "open" or "active" items, show them
      const activeCount = Object.entries(counts)
        .filter(([k]) => ["open", "active", "in progress", "in_progress", "todo", "pending"].includes(k))
        .reduce((sum, [, c]) => sum + c, 0);
      if (activeCount > 0 && activeCount !== topCount) {
        kpis.push({
          label: "Active",
          value: activeCount,
          type: "count",
          color: "amber",
        });
      }

      // Show completed/closed count if exists
      const closedCount = Object.entries(counts)
        .filter(([k]) => ["closed", "done", "completed", "resolved", "merged"].includes(k))
        .reduce((sum, [, c]) => sum + c, 0);
      if (closedCount > 0) {
        kpis.push({
          label: "Completed",
          value: closedCount,
          type: "count",
          color: "green",
        });
      }
    }
  }

  // 3. Currency sum KPIs
  const currencyFields = fields.filter((f) => fieldMeta[f]?.type === "currency");
  for (const currField of currencyFields.slice(0, 1)) {
    const values = rows.map((r) => {
      const v = r[currField];
      if (typeof v === "number") return v;
      if (typeof v === "string") return parseFloat(v.replace(/[^0-9.-]/g, ""));
      return NaN;
    }).filter((v) => !isNaN(v));

    if (values.length > 0) {
      const total = values.reduce((a, b) => a + b, 0);
      kpis.push({
        label: `Total ${fieldMeta[currField]?.displayName || currField}`,
        value: `$${total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        type: "currency",
        color: "green",
      });
    }
  }

  // 4. Use KPI hints from understand-purpose if available
  const kpiHints = (spec as any)._kpiHints as Array<{ label: string; field: string; aggregation: string }> | undefined;
  if (kpiHints) {
    for (const hint of kpiHints.slice(0, 3)) {
      // Skip if we already have a KPI for this
      if (kpis.some((k) => k.label === hint.label)) continue;
      if (hint.field === "*" && hint.aggregation === "count") continue; // Already have total

      const values = rows.map((r) => r[hint.field]).filter((v) => v !== null && v !== undefined);
      if (values.length === 0) continue;

      const numValues = values.map((v) => typeof v === "number" ? v : parseFloat(String(v))).filter((v) => !isNaN(v));
      let computedValue: string | number = 0;

      switch (hint.aggregation) {
        case "count":
          computedValue = values.length;
          break;
        case "sum":
          computedValue = numValues.reduce((a, b) => a + b, 0);
          break;
        case "avg":
          computedValue = numValues.length > 0 ? Math.round((numValues.reduce((a, b) => a + b, 0) / numValues.length) * 100) / 100 : 0;
          break;
        case "min":
          computedValue = numValues.length > 0 ? Math.min(...numValues) : 0;
          break;
        case "max":
          computedValue = numValues.length > 0 ? Math.max(...numValues) : 0;
          break;
        case "latest":
          computedValue = String(values[values.length - 1]);
          break;
      }

      kpis.push({ label: hint.label, value: computedValue, type: "count", color: "blue" });
    }
  }

  return kpis.slice(0, 6); // Max 6 KPIs
}

function generateSummary(
  rows: any[],
  fields: string[],
  fieldMeta: DataInsights["fieldMeta"],
  spec: ToolSystemSpec,
  view: ViewSpec,
): string {
  const parts: string[] = [];
  const entityName = view.source.entity;
  const integration = spec.entities.find((e) => e.name === entityName)?.sourceIntegration ?? "unknown";

  parts.push(`${rows.length} ${entityName.toLowerCase()}${rows.length !== 1 ? "s" : ""} from ${integration}`);

  // Status breakdown
  const statusField = fields.find((f) => fieldMeta[f]?.type === "status");
  if (statusField) {
    const counts: Record<string, number> = {};
    for (const row of rows) {
      const val = String(row[statusField] ?? "Unknown");
      counts[val] = (counts[val] ?? 0) + 1;
    }
    const breakdown = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => `${v} ${k.toLowerCase()}`)
      .join(", ");
    if (breakdown) parts.push(breakdown);
  }

  // Date range
  const dateField = fields.find((f) => fieldMeta[f]?.type === "date");
  if (dateField) {
    const dates = rows
      .map((r) => new Date(r[dateField]))
      .filter((d) => !isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());
    if (dates.length > 1) {
      const oldest = dates[0];
      const newest = dates[dates.length - 1];
      const daySpan = Math.ceil((newest.getTime() - oldest.getTime()) / (1000 * 60 * 60 * 24));
      if (daySpan <= 1) parts.push("from today");
      else if (daySpan <= 7) parts.push(`from the last ${daySpan} days`);
      else if (daySpan <= 30) parts.push(`from the last ${Math.ceil(daySpan / 7)} weeks`);
      else parts.push(`spanning ${Math.ceil(daySpan / 30)} months`);
    }
  }

  return parts.join(" · ");
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function getStatusColor(status: string): KpiMetric["color"] {
  const green = ["open", "active", "healthy", "paid", "success", "completed", "done", "resolved", "merged"];
  const red = ["closed", "failed", "blocked", "critical", "overdue", "cancelled"];
  const amber = ["pending", "in progress", "in_progress", "review", "in review", "draft", "warning"];
  if (green.includes(status)) return "green";
  if (red.includes(status)) return "red";
  if (amber.includes(status)) return "amber";
  return "neutral";
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
 * This function resolves each field using progressive strategies:
 *   1. Direct key match (row.message)
 *   2. Smart resolution for common API patterns (commit.message, author.login, etc.)
 *   3. Universal flat map match (recursively flattens object and matches by key suffix)
 *   4. Deep search through nested objects
 *   5. Object stringification fallback
 *
 * If field resolution fails for >50% of fields, includes all scalar values from the row
 * so the UI always displays something useful.
 */
function flattenForView(row: any, fields: string[]): Record<string, any> {
  if (!row || typeof row !== "object") return row;

  // Pre-compute a universal flat map of ALL values in the row
  const flatMap = buildFlatMap(row);
  const result: Record<string, any> = {};
  let resolvedCount = 0;

  for (const field of fields) {
    const normalized = field.toLowerCase();
    // Canonical form: strip underscores, hyphens, spaces for fuzzy matching
    const canonical = normalized.replace(/[_\-\s]/g, "");

    // 1. Direct key match (scalar values)
    if (row[field] !== undefined && row[field] !== null && typeof row[field] !== "object") {
      result[field] = row[field];
      resolvedCount++;
      continue;
    }
    if (row[normalized] !== undefined && row[normalized] !== null && typeof row[normalized] !== "object") {
      result[field] = row[normalized];
      resolvedCount++;
      continue;
    }

    // 2. Smart resolution for common API patterns
    const resolved = resolveFieldSmart(row, normalized);
    if (resolved !== undefined) {
      result[field] = resolved;
      resolvedCount++;
      continue;
    }

    // 3. Universal flat map match — try exact, suffix, and contains matching
    const flatResult = matchFromFlatMap(flatMap, normalized, canonical);
    if (flatResult !== undefined) {
      result[field] = flatResult;
      resolvedCount++;
      continue;
    }

    // 4. Deep search through nested objects
    const deepResult = deepFindValue(row, normalized, 0);
    if (deepResult !== undefined) {
      result[field] = deepResult;
      resolvedCount++;
      continue;
    }

    // 5. Object stringification — if key exists but is an object, stringify for display
    if (row[field] !== undefined) {
      result[field] = stringifyValue(row[field]);
      resolvedCount++;
    } else if (row[normalized] !== undefined) {
      result[field] = stringifyValue(row[normalized]);
      resolvedCount++;
    }
  }

  // Fallback: if <50% of fields resolved, include ALL scalar values from original row
  // so the UI always shows something useful
  if (resolvedCount < fields.length * 0.5) {
    console.warn("[flattenForView] Low resolution rate", {
      resolved: resolvedCount,
      total: fields.length,
      fields,
      flatMapKeys: Array.from(flatMap.keys()).slice(0, 30),
      rowTopKeys: Object.keys(row).slice(0, 15),
    });
    for (const [key, value] of flatMap) {
      // Only add scalar values, skip internal IDs and very long values
      if (value === null || value === undefined) continue;
      const strVal = String(value);
      if (strVal.length > 500) continue;
      // Include as supplemental data (view fields take priority)
      if (!(key in result)) {
        result[key] = value;
      }
    }
  }

  return result;
}

/**
 * Build a flat key→value map from a nested object.
 * Uses first-occurrence-wins for leaf keys to prefer shallower/earlier values.
 * Produces multiple key variants for flexible matching:
 *   - Original key (e.g., "commit_sha")
 *   - Lowercased (e.g., "commit_sha")
 *   - Leaf key only (e.g., "sha" from "commit.sha") — first occurrence wins
 *   - Full dot-path (e.g., "commit.author.name")
 *   - Canonical form without separators (e.g., "commitsha")
 */
function buildFlatMap(obj: any, prefix = "", depth = 0): Map<string, any> {
  const map = new Map<string, any>();
  if (!obj || typeof obj !== "object" || depth > 4) return map;
  if (Array.isArray(obj)) return map;

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const lowerKey = key.toLowerCase();

    if (value === null || value === undefined) continue;

    if (typeof value !== "object" || Array.isArray(value)) {
      // Scalar value or array — add with multiple key formats
      // First-occurrence-wins for leaf keys (prefer shallower values)
      if (!map.has(lowerKey)) map.set(lowerKey, value);
      map.set(fullKey.toLowerCase(), value);
      // Also store canonical form (no underscores/hyphens)
      const canonical = lowerKey.replace(/[_\-]/g, "");
      if (canonical !== lowerKey && !map.has(canonical)) {
        map.set(canonical, value);
      }
    } else {
      // Nested object — recurse
      const nested = buildFlatMap(value, fullKey, depth + 1);
      for (const [nestedKey, nestedValue] of nested) {
        if (!map.has(nestedKey)) map.set(nestedKey, nestedValue);
      }
      // Also stringify the object itself as a fallback
      if (!map.has(lowerKey + "_obj")) {
        map.set(lowerKey + "_obj", summarizeObject(value));
      }
    }
  }

  return map;
}

/**
 * Match a view field name against the flat map using progressive strategies.
 * Strategies (in order): exact → canonical → suffix → prefix → contains → canonical suffix
 */
function matchFromFlatMap(flatMap: Map<string, any>, normalized: string, canonical: string): any {
  // 1. Exact match on lowercased key
  if (flatMap.has(normalized)) return flatMap.get(normalized);
  // 2. Canonical form match (commitsha matches commit_sha)
  if (flatMap.has(canonical)) return flatMap.get(canonical);

  // 3. Suffix match: field "sha" matches flat key "commit.sha" or "commit_sha"
  for (const [key, value] of flatMap) {
    if (key.endsWith(`.${normalized}`) || key.endsWith(`_${normalized}`)) {
      return value;
    }
  }

  // 3b. Reverse suffix match: field "commit_sha" matches flat key "sha"
  // Handles LLM-generated compound field names like "commit_sha" when data has just "sha"
  for (const [key, value] of flatMap) {
    if (key.endsWith("_obj")) continue;
    if (normalized.endsWith(`_${key}`) || normalized.endsWith(`.${key}`)) {
      return value;
    }
  }

  // 4. Prefix match with priority: field "author" matches "author_name" > "author_login" > first match
  const preferredSuffixes = ["_name", "_login", "_title", "_label", "_displayname", "_display_name", "_value"];
  for (const suffix of preferredSuffixes) {
    if (flatMap.has(`${normalized}${suffix}`)) return flatMap.get(`${normalized}${suffix}`);
  }
  // Generic prefix match (first match wins)
  for (const [key, value] of flatMap) {
    if (key.startsWith(`${normalized}_`) || key.startsWith(`${normalized}.`)) {
      return value;
    }
  }

  // 5. Contains match: field "message" matches flat key "commit.message"
  for (const [key, value] of flatMap) {
    if (key.includes(`.${normalized}`)) {
      return value;
    }
  }

  // 6. Canonical matching: strip all separators and compare
  for (const [key, value] of flatMap) {
    if (key.endsWith("_obj")) continue; // Skip object summaries for canonical matching
    const keyCanonical = key.replace(/[_\-\.]/g, "");
    if (keyCanonical === canonical) {
      return value;
    }
    // Field name as suffix of canonical key (e.g., "sha" matches "commitsha")
    if (keyCanonical.endsWith(canonical) && canonical.length >= 3) {
      return value;
    }
    // Reverse: canonical field ends with flat map key (e.g., "commitsha" ends with "sha")
    if (canonical.endsWith(keyCanonical) && keyCanonical.length >= 3) {
      return value;
    }
  }

  // 7. Last resort: check _obj summaries (stringified nested objects)
  if (flatMap.has(`${normalized}_obj`)) return flatMap.get(`${normalized}_obj`);

  return undefined;
}

function stringifyValue(value: any): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value)) {
    return value.slice(0, 5).map((v: any) => typeof v === "object" ? (v?.name ?? v?.label ?? v?.title ?? JSON.stringify(v)) : String(v)).join(", ");
  }
  return summarizeObject(value);
}

function summarizeObject(obj: any): string {
  if (!obj || typeof obj !== "object") return String(obj ?? "");
  // Try to extract a meaningful display value from common patterns
  if (obj.name) return String(obj.name);
  if (obj.login) return String(obj.login);
  if (obj.title) return String(obj.title);
  if (obj.label) return String(obj.label);
  if (obj.displayName) return String(obj.displayName);
  if (obj.email) return String(obj.email);
  if (obj.address) return String(obj.address);
  if (obj.display_name) return String(obj.display_name);
  if (obj.full_name) return String(obj.full_name);
  if (obj.value) return String(obj.value);
  if (obj.content) return typeof obj.content === "string" ? obj.content.substring(0, 200) : String(obj.content);
  if (obj.text) return typeof obj.text === "string" ? obj.text.substring(0, 200) : String(obj.text);
  if (obj.plain_text) return String(obj.plain_text);
  // Last resort: JSON with truncation
  const json = JSON.stringify(obj);
  return json.length > 200 ? json.substring(0, 197) + "..." : json;
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
  if ((field === "commit_sha" || field === "commitsha") && row.sha) return row.sha.substring(0, 7);
  if ((field === "commit_message" || field === "commitmessage") && row.commit?.message) return row.commit.message;
  if ((field === "commit_author" || field === "commitauthor") && (row.commit?.author?.name || row.author?.login)) return row.commit?.author?.name ?? row.author?.login;
  if ((field === "commit_date" || field === "commitdate") && (row.commit?.author?.date || row.commit?.committer?.date)) return formatDate(row.commit?.author?.date ?? row.commit?.committer?.date);

  // GitHub issue/PR patterns
  if (field === "title" && row.title) return row.title;
  if ((field === "issue_title" || field === "issuetitle" || field === "pr_title" || field === "prtitle") && row.title) return row.title;
  if (field === "number" && row.number != null) return row.number;
  if ((field === "issue_number" || field === "issuenumber" || field === "pr_number" || field === "prnumber") && row.number != null) return row.number;
  if (field === "status" && row.state) return row.state;
  if ((field === "issue_status" || field === "issuestatus" || field === "pr_status" || field === "prstatus") && row.state) return row.state;
  if (field === "assignee" && row.assignee?.login) return row.assignee.login;
  if (field === "labels" && Array.isArray(row.labels)) return row.labels.map((l: any) => l.name ?? l).join(", ");
  if (field === "created" && row.created_at) return formatDate(row.created_at);
  if (field === "updated" && row.updated_at) return formatDate(row.updated_at);
  if ((field === "created_date" || field === "createddate" || field === "creation_date") && row.created_at) return formatDate(row.created_at);
  if ((field === "updated_date" || field === "updateddate" || field === "last_updated") && row.updated_at) return formatDate(row.updated_at);
  if ((field === "repo" || field === "repo_name" || field === "reponame" || field === "repository_name" || field === "repositoryname") && row.repository?.full_name) return row.repository.full_name;
  if ((field === "repo" || field === "repo_name" || field === "reponame") && row.full_name) return row.full_name;

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
