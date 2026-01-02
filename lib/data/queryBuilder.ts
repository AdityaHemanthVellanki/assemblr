import "server-only";

import type { DashboardSpec } from "@/lib/dashboard/spec";
import type { DatabaseSchema, TableInfo } from "@/lib/data/schema";
import type { SqlQuery } from "@/lib/data/postgres";

export type QueryPlan =
  | { kind: "metric"; query: SqlQuery }
  | { kind: "series"; query: SqlQuery }
  | { kind: "table"; query: SqlQuery; columns: string[] };

function isSafeIdentifier(input: string) {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(input);
}

function quoteIdent(input: string) {
  if (!isSafeIdentifier(input)) {
    throw new Error(`Invalid identifier: ${input}`);
  }
  return `"${input}"`;
}

function getTable(schema: DatabaseSchema, tableName: string): TableInfo {
  if (!isSafeIdentifier(tableName)) {
    throw new Error(`Invalid table name: ${tableName}`);
  }
  const table = schema.tables.find((t) => t.name === tableName);
  if (!table) {
    throw new Error(`Missing table: ${tableName}`);
  }
  return table;
}

function requireColumn(table: TableInfo, columnName: string) {
  if (!isSafeIdentifier(columnName)) {
    throw new Error(`Invalid column name: ${columnName}`);
  }
  const col = table.columns.find((c) => c.name === columnName);
  if (!col) {
    throw new Error(`Missing column: ${table.name}.${columnName}`);
  }
  return col;
}

function pickTimeColumn(table: TableInfo) {
  const candidates = ["created_at", "createdAt", "timestamp", "ts", "date"];
  for (const c of candidates) {
    if (table.columns.some((col) => col.name === c)) return c;
  }
  return null;
}

function metricAggSql(metric: DashboardSpec["metrics"][number], table: TableInfo) {
  if (metric.type === "count") {
    if (metric.field) {
      throw new Error(`Metric "${metric.id}" is count and must not include field`);
    }
    return { expr: "COUNT(*)::bigint", label: "value" };
  }

  const field = metric.field?.trim();
  if (!field) {
    throw new Error(`Metric "${metric.id}" is sum and requires field`);
  }
  requireColumn(table, field);
  return {
    expr: `COALESCE(SUM(${quoteIdent(field)}), 0)::double precision`,
    label: "value",
  };
}

function pickSafeTableColumns(table: TableInfo) {
  const deny = [
    /password/i,
    /secret/i,
    /token/i,
    /key/i,
    /salt/i,
    /hash/i,
  ];

  const allowed = table.columns
    .map((c) => c.name)
    .filter((name) => isSafeIdentifier(name))
    .filter((name) => !deny.some((re) => re.test(name)));

  const preferred = [
    "id",
    "name",
    "title",
    "status",
    "type",
    "created_at",
    "createdAt",
    "updated_at",
    "updatedAt",
  ];

  const picked: string[] = [];
  for (const p of preferred) {
    if (allowed.includes(p) && !picked.includes(p)) picked.push(p);
  }

  const numericTypes = new Set([
    "integer",
    "bigint",
    "numeric",
    "double precision",
    "real",
    "smallint",
    "decimal",
  ]);

  for (const col of table.columns) {
    if (!allowed.includes(col.name)) continue;
    if (!numericTypes.has(col.dataType)) continue;
    if (picked.includes(col.name)) continue;
    picked.push(col.name);
  }

  for (const name of allowed) {
    if (picked.includes(name)) continue;
    picked.push(name);
  }

  return picked.slice(0, 6);
}

export function buildQueryForView({
  spec,
  viewId,
  schema,
  maxRows = 1000,
}: {
  spec: DashboardSpec;
  viewId: string;
  schema: DatabaseSchema;
  maxRows?: number;
}): QueryPlan {
  const view = spec.views.find((v) => v.id === viewId);
  if (!view) throw new Error("Unknown viewId");

  if (view.type === "table") {
    const tableName = view.table;
    if (!tableName) throw new Error("Table view requires table");
    const table = getTable(schema, tableName);
    const columns = pickSafeTableColumns(table);
    if (columns.length === 0) throw new Error("No safe columns for table view");

    const orderBy = columns.includes("created_at")
      ? "created_at"
      : columns.includes("createdAt")
        ? "createdAt"
        : columns.includes("id")
          ? "id"
          : columns[0];

    const text = `SELECT ${columns
      .map(quoteIdent)
      .join(", ")} FROM ${quoteIdent(tableName)} ORDER BY ${quoteIdent(
      orderBy,
    )} DESC NULLS LAST LIMIT ${Math.min(50, maxRows)}`;

    return { kind: "table", query: { text, values: [] }, columns };
  }

  const metricId = view.metricId;
  if (!metricId) throw new Error("This view requires metricId");
  const metric = spec.metrics.find((m) => m.id === metricId);
  if (!metric) throw new Error(`View references missing metricId "${metricId}"`);

  // Handle persisted vs inline metrics
  const tableName = metric.table || "unknown";
  const table = getTable(schema, tableName);
  
  if (metric.type === "sum") {
    if (!metric.field) throw new Error("sum metric requires field");
    requireColumn(table, metric.field);
  }

  if (view.type === "metric") {
    const agg = metricAggSql(metric, table);
    const text = `SELECT ${agg.expr} AS ${agg.label} FROM ${quoteIdent(
      metric.table || "unknown",
    )} LIMIT 1`;
    return { kind: "metric", query: { text, values: [] } };
  }

  if (view.type === "line_chart" || view.type === "bar_chart") {
    if (metric.groupBy !== "day") {
      throw new Error(`View "${view.id}" requires a metric grouped by day`);
    }

    const timeCol = pickTimeColumn(table);
    if (!timeCol) {
      throw new Error(`Table "${table.name}" has no time column for groupBy day`);
    }

    const agg = metricAggSql(metric, table);
    const text = `
      SELECT
        DATE_TRUNC('day', ${quoteIdent(timeCol)}) AS bucket,
        ${agg.expr} AS value
      FROM ${quoteIdent(metric.table || "unknown")}
      GROUP BY bucket
      ORDER BY bucket ASC
      LIMIT ${Math.min(365, maxRows)}
    `.trim().replace(/\s+/g, " ");

    return { kind: "series", query: { text, values: [] } };
  }

  throw new Error("Unsupported view type");
}

