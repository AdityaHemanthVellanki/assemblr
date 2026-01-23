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
  const value = constraint.value.toLowerCase();
  const violations: Array<{ actionId: string; dropped: number }> = [];
  const next = outputs.map((entry) => {
    if (entry.action.integrationId !== "google") {
      return { ...entry, output: [] };
    }
    const normalized = normalizeRows(entry.output);
    const filtered = normalized.filter((row) => includesConstraint(row, value));
    const dropped = normalized.length - filtered.length;
    if (dropped > 0) {
      violations.push({ actionId: entry.action.id, dropped });
    }
    return { ...entry, output: filtered };
  });
  return { outputs: next, violations };
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
