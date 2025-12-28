import "server-only";

import { Pool, type PoolConfig } from "pg";

type Pooled = {
  pool: Pool;
  createdAtMs: number;
};

const globalForPools = globalThis as unknown as {
  __assemblrPgPools?: Map<string, Pooled>;
};

const pools = (globalForPools.__assemblrPgPools ??= new Map<string, Pooled>());

export type PostgresCredentials = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
};

export type SqlQuery = {
  text: string;
  values: unknown[];
};

function assertSafeSelectQuery(text: string) {
  const trimmed = text.trim();
  if (!/^select\b/i.test(trimmed)) {
    throw new Error("Only SELECT queries are allowed");
  }
  if (trimmed.includes(";")) {
    throw new Error("Multiple statements are not allowed");
  }

  const lowered = trimmed.toLowerCase();
  const forbidden = [
    "insert",
    "update",
    "delete",
    "drop",
    "alter",
    "create",
    "grant",
    "revoke",
    "truncate",
    "comment",
    "copy",
    "execute",
    "call",
    "do",
    "vacuum",
    "analyze",
  ];

  for (const word of forbidden) {
    if (new RegExp(`\\b${word}\\b`, "i").test(lowered)) {
      throw new Error("Unsafe query detected");
    }
  }
}

export function getPostgresPool({
  dataSourceId,
  credentials,
}: {
  dataSourceId: string;
  credentials: PostgresCredentials;
}) {
  const cached = pools.get(dataSourceId);
  if (cached) return cached.pool;

  const config: PoolConfig = {
    host: credentials.host,
    port: credentials.port,
    database: credentials.database,
    user: credentials.user,
    password: credentials.password,
    ssl: credentials.ssl ? { rejectUnauthorized: true } : undefined,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    keepAlive: true,
  };

  const pool = new Pool(config);
  pools.set(dataSourceId, { pool, createdAtMs: Date.now() });
  return pool;
}

export async function testPostgresConnection(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
  } finally {
    client.release();
  }
}

export async function runReadOnlyQuery({
  pool,
  query,
  timeoutMs,
}: {
  pool: Pool;
  query: SqlQuery;
  timeoutMs: number;
}) {
  assertSafeSelectQuery(query.text);

  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = $1", [timeoutMs]);
    const res = await client.query(query.text, query.values);
    await client.query("COMMIT");
    return res;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw err;
  } finally {
    client.release();
  }
}

