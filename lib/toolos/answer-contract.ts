import type { AnswerContract, ActionSpec } from "@/lib/toolos/spec";

type OutputEntry = { action: ActionSpec; output: any };

export function validateFetchedData(outputs: OutputEntry[], contract: AnswerContract | undefined | null) {
  if (!contract) {
    return { outputs, violations: [] as Array<{ actionId: string; dropped: number }> };
  }
  if (contract.entity_type !== "email") {
    return { outputs, violations: [] as Array<{ actionId: string; dropped: number }> };
  }
  const constraint = contract.required_constraints[0];
  if (!constraint) {
    return { outputs, violations: [] as Array<{ actionId: string; dropped: number }> };
  }
  
  // Enhanced Constraint Logic: Support Time-based filtering
  // If the constraint looks like a time window (e.g. "last 24 hours"), we apply date filtering.
  const value = constraint.value.toLowerCase();
  const isTimeConstraint = /last\s+\d+\s+(hour|day|week|month|year)s?/.test(value) || 
                          value.includes("newer_than") || 
                          value.includes("since");

  const violations: Array<{ actionId: string; dropped: number }> = [];
  outputs.forEach((entry) => {
    if (entry.action.integrationId !== "google") {
      return;
    }
    const normalized = normalizeRows(entry.output);
    
    let kept = 0;
    if (isTimeConstraint) {
        kept = normalized.filter((row) => checkTimeConstraint(row, value)).length;
    } else {
        kept = normalized.filter((row) => includesConstraint(row, value)).length;
    }

    const dropped = normalized.length - kept;
    if (dropped > 0) {
      console.warn(`[AnswerContract] Violation in ${entry.action.id}: Dropped ${dropped} rows. Keeping all rows (Lossless Mode).`);
      violations.push({ actionId: entry.action.id, dropped });
    }
  });
  return { outputs, violations };
}

function normalizeRows(output: any): Array<Record<string, any>> {
  if (Array.isArray(output)) {
    return output.map((row) => normalizeEmailRow(row) ?? row);
  }
  if (output && typeof output === "object") {
    return Object.values(output)
      .filter((value) => value && typeof value === "object")
      .map((row) => normalizeEmailRow(row) ?? (row as Record<string, any>));
  }
  return [];
}

function checkTimeConstraint(row: Record<string, any>, constraintValue: string): boolean {
    const dateStr = row.date || row.internalDate;
    if (!dateStr) return false; // Can't validate without date
    
    const rowTime = new Date(dateStr).getTime();
    if (isNaN(rowTime)) return false; // Invalid date

    const now = Date.now();
    const match = constraintValue.match(/last\s+(\d+)\s+(hour|day|week|month|year)s?/);
    
    if (match) {
        const amount = parseInt(match[1], 10);
        const unit = match[2];
        let ms = 0;
        if (unit.startsWith("hour")) ms = amount * 60 * 60 * 1000;
        else if (unit.startsWith("day")) ms = amount * 24 * 60 * 60 * 1000;
        else if (unit.startsWith("week")) ms = amount * 7 * 24 * 60 * 60 * 1000;
        else if (unit.startsWith("month")) ms = amount * 30 * 24 * 60 * 60 * 1000;
        
        return rowTime >= (now - ms);
    }
    
    // Fallback for "newer_than:1d" style if passed directly
    if (constraintValue.includes("newer_than")) {
        // Simple heuristic: if it mentions 1d, 24h etc.
        // This is harder to parse robustly without a library, but let's try basic common cases
        if (constraintValue.includes("1d") || constraintValue.includes("24h")) {
             return rowTime >= (now - 24 * 60 * 60 * 1000);
        }
    }

    return true; // Default to pass if we can't parse constraint but identified it as time-based (lenient)
}

function includesConstraint(row: Record<string, any>, value: string) {
  const subject = String(row.subject ?? "").toLowerCase();
  const snippet = String(row.snippet ?? "").toLowerCase();
  const body = String(row.body ?? "").toLowerCase();
  return subject.includes(value) || snippet.includes(value) || body.includes(value);
}

function normalizeEmailRow(row: any): Record<string, any> | null {
  if (!row || typeof row !== "object") return null;
  if ("subject" in row || "snippet" in row) return row as Record<string, any>;
  const headers = Array.isArray(row?.payload?.headers) ? row.payload.headers : [];
  if (headers.length === 0) return null;
  const findHeader = (name: string) =>
    headers.find((h: any) => String(h?.name ?? "").toLowerCase() === name.toLowerCase())?.value ?? "";
  return {
    from: findHeader("from"),
    subject: findHeader("subject"),
    snippet: row?.snippet ?? "",
    body: row?.snippet ?? "",
    date: findHeader("date") || "",
  };
}
