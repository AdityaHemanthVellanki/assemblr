import { parse } from "csv-parse/sync";
import {
  IntegrationConnector,
  ConnectInput,
  ConnectResult,
  FetchInput,
  NormalizedData,
  NormalizedTable,
} from "../types";

export class CsvConnector implements IntegrationConnector {
  id = "csv";
  name = "CSV Upload";
  authType = "none" as const;
  capabilities = ["file_ingest", "tabular_data"] as const;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async connect(_input: ConnectInput): Promise<ConnectResult> {
    // CSV doesn't need connection logic per se, maybe just file existence check
    return { success: true };
  }

  async fetch(input: FetchInput): Promise<NormalizedData> {
    // For CSV, the "parameters" should contain the raw CSV content or a reference.
    // In a real system, we'd stream from storage.
    // For this runtime abstraction, we'll assume parameters.content contains the CSV string.
    const csvContent = input.parameters.content;
    if (!csvContent || typeof csvContent !== "string") {
      throw new Error("CSV content missing in parameters");
    }

    try {
      const records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
      }) as unknown[];

      if (records.length === 0) {
        return {
          type: "table",
          columns: [],
          rows: [],
        };
      }

      // Infer columns from first record
      const headers = Object.keys(records[0] as object);
      const columns = headers.map((h) => ({ name: h, type: "string" }));
      
      const rows = records.map((r) => Object.values(r as object));

      const normalized: NormalizedTable = {
        type: "table",
        columns,
        rows,
      };

      return normalized;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to parse CSV: ${message}`);
    }
  }
}
