import "server-only";

import type { Pool } from "pg";

import { runReadOnlyQuery } from "@/lib/data/postgres";

export type ColumnInfo = {
  name: string;
  dataType: string;
};

export type TableInfo = {
  name: string;
  columns: ColumnInfo[];
};

export type DatabaseSchema = {
  tables: TableInfo[];
};

type Cached = {
  expiresAtMs: number;
  promise: Promise<DatabaseSchema>;
};

const globalForSchema = globalThis as unknown as {
  __assemblrSchemaCache?: Map<string, Cached>;
};

const cache = (globalForSchema.__assemblrSchemaCache ??= new Map<
  string,
  Cached
>());

export async function introspectSchema(
  pool: Pool,
  { timeoutMs = 3_000 }: { timeoutMs?: number } = {},
): Promise<DatabaseSchema> {
  const tablesRes = await runReadOnlyQuery({
    pool,
    query: {
      text: `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name ASC
      `.trim(),
      values: [],
    },
    timeoutMs,
  });

  const columnsRes = await runReadOnlyQuery({
    pool,
    query: {
      text: `
        SELECT table_name, column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name ASC, ordinal_position ASC
      `.trim(),
      values: [],
    },
    timeoutMs,
  });

  const columnsByTable = new Map<string, ColumnInfo[]>();
  for (const row of columnsRes.rows as Array<{
    table_name: string;
    column_name: string;
    data_type: string;
  }>) {
    let cols = columnsByTable.get(row.table_name);
    if (!cols) {
      cols = [];
      columnsByTable.set(row.table_name, cols);
    }
    cols.push({ name: row.column_name, dataType: row.data_type });
  }

  const tables: TableInfo[] = (tablesRes.rows as Array<{ table_name: string }>).map(
    (t) => ({
      name: t.table_name,
      columns: (() => {
        const cols = columnsByTable.get(t.table_name);
        if (!cols) {
          throw new Error("Schema introspection error");
        }
        return cols;
      })(),
    }),
  );

  return { tables };
}

export function getCachedSchema({
  dataSourceId,
  pool,
  ttlMs = 5 * 60_000,
}: {
  dataSourceId: string;
  pool: Pool;
  ttlMs?: number;
}) {
  const now = Date.now();
  const existing = cache.get(dataSourceId);
  if (existing && existing.expiresAtMs > now) {
    return existing.promise;
  }

  const promise = introspectSchema(pool);
  cache.set(dataSourceId, { expiresAtMs: now + ttlMs, promise });
  return promise;
}
