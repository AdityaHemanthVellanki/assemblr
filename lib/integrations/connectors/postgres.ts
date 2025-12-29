import { Pool } from "pg";
import {
  IntegrationConnector,
  ConnectInput,
  ConnectResult,
  FetchInput,
  NormalizedData,
  NormalizedTable,
} from "../types";

export class PostgresConnector implements IntegrationConnector {
  id = "postgres";
  name = "Postgres";
  authType = "database" as const;
  capabilities = ["tabular_data", "user_identity", "time_series"] as const;

  async connect(input: ConnectInput): Promise<ConnectResult> {
    const { connectionString } = input.credentials;
    if (!connectionString) {
      return { success: false, error: "Missing connectionString" };
    }

    try {
      const pool = new Pool({
        connectionString,
        ssl: { rejectUnauthorized: false }, // Enforce SSL, but allow self-signed for flexibility
        connectionTimeoutMillis: 5000,
      });
      const client = await pool.connect();
      client.release();
      await pool.end();
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  async fetch(input: FetchInput): Promise<NormalizedData> {
    // Credentials injected by executeIntegration
    const credentials = (input as unknown as { credentials: Record<string, string> }).credentials;
    
    if (!credentials?.connectionString) {
      throw new Error("Postgres connector requires connectionString");
    }

    const pool = new Pool({
      connectionString: credentials.connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000, // 10s timeout
    });

    try {
      const client = await pool.connect();
      try {
        // Query Builder Logic (Simplified for runtime)
        const tableName = input.parameters.table;
        if (!tableName || typeof tableName !== "string" || !/^[a-zA-Z0-9_]+$/.test(tableName)) {
          throw new Error("Invalid or missing table parameter");
        }

        const limit = 10000;
        const query = `SELECT * FROM "${tableName}" LIMIT $1`;
        
        const res = await client.query(query, [limit]);
        
        const columns = res.fields.map((f) => ({
          name: f.name,
          type: "string", // Simplified type mapping
        }));

        const normalized: NormalizedTable = {
          type: "table",
          columns,
          rows: res.rows.map(row => Object.values(row)),
        };

        return normalized;
      } finally {
        client.release();
      }
    } finally {
      await pool.end();
    }
  }
}
