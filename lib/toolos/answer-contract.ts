import type { AnswerContract, ActionSpec } from "@/lib/toolos/spec";

type OutputEntry = { action: ActionSpec; output: any };

export function validateFetchedData(outputs: OutputEntry[], contract: AnswerContract | undefined | null) {
  const normalizedOutputs = outputs.map((entry) => ({
    ...entry,
    output: normalizeOutputForContract(entry.output, contract),
  }));
  if (!contract) {
    return { outputs: normalizedOutputs, violations: [] as Array<{ actionId: string; dropped: number }> };
  }
  const entityType = contract.entity_type.toLowerCase();
  const constraint = contract.required_constraints[0];
  const value = constraint?.value?.toLowerCase();
  const isTimeConstraint =
    value &&
    (/last\s+\d+\s+(hour|day|week|month|year)s?/.test(value) ||
      value.includes("newer_than") ||
      value.includes("since"));

  const violations: Array<{ actionId: string; dropped: number }> = [];
  const validatedOutputs = normalizedOutputs.map((entry) => {
    const normalized = normalizeRows(entry.output, entityType);
    if (entityType !== "email") {
      return entry;
    }
    const requiredCheck = filterRequiredEmailFields(normalized);
    if (requiredCheck.dropped > 0) {
      violations.push({ actionId: entry.action.id, dropped: requiredCheck.dropped });
    }
    if (value) {
      const kept = isTimeConstraint
        ? normalized.filter((row) => checkTimeConstraint(row, value))
        : normalized.filter((row) => includesConstraint(row, value));
      const dropped = normalized.length - kept.length;
      if (dropped > 0) {
        violations.push({ actionId: entry.action.id, dropped });
      }
    }
    return entry;
  });
  return { outputs: validatedOutputs, violations };
}

function normalizeOutputForContract(output: any, contract: AnswerContract | undefined | null) {
  if (!contract) return output;
  const entityType = contract.entity_type.toLowerCase();
  const shape = contract.result_shape;
  const listShape = contract.list_shape ?? "array";
  const isList = listShape === "array" || shape?.kind === "list" || entityType === "email";
  if (!isList) return output;
  const rows = normalizeRows(output, entityType);
  const ordered = applyListOrdering(rows, shape);
  return applyListLimit(ordered, shape);
}

function applyListOrdering(rows: Array<Record<string, any>>, shape?: AnswerContract["result_shape"]) {
  const orderBy = shape?.order_by;
  if (!orderBy) return rows;
  const direction = shape?.order_direction ?? "desc";
  const sorted = [...rows].sort((a, b) => {
    const aValue = a?.[orderBy];
    const bValue = b?.[orderBy];
    const aNum = typeof aValue === "number" ? aValue : Number(aValue);
    const bNum = typeof bValue === "number" ? bValue : Number(bValue);
    if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
      return direction === "asc" ? aNum - bNum : bNum - aNum;
    }
    const aText = String(aValue ?? "");
    const bText = String(bValue ?? "");
    return direction === "asc" ? aText.localeCompare(bText) : bText.localeCompare(aText);
  });
  return sorted;
}

function applyListLimit(rows: Array<Record<string, any>>, shape?: AnswerContract["result_shape"]) {
  if (!shape?.limit) return rows;
  return rows.slice(0, shape.limit);
}

function normalizeRows(output: any, entityType?: string): Array<Record<string, any>> {
  if (Array.isArray(output)) {
    return output.map((row) => normalizeRowByEntity(row, entityType) ?? row);
  }
  if (output && typeof output === "object") {
    const messages = Array.isArray((output as any).messages) ? (output as any).messages : null;
    if (messages) {
      return messages.map((row: any) => normalizeRowByEntity(row, entityType) ?? row);
    }
    return Object.values(output)
      .filter((value) => value && typeof value === "object")
      .flatMap((row) => {
        if (Array.isArray(row)) {
          return row.map((inner) => normalizeRowByEntity(inner, entityType) ?? inner);
        }
        return [normalizeRowByEntity(row, entityType) ?? (row as Record<string, any>)];
      });
  }
  return [];
}

function normalizeRowByEntity(row: any, entityType?: string) {
  if (entityType === "email") {
    return normalizeEmailRow(row);
  }
  return row as Record<string, any>;
}

function filterRequiredEmailFields(rows: Array<Record<string, any>>) {
  const kept = rows.filter((row) => {
    const from = String(row?.from ?? "").trim();
    const subject = String(row?.subject ?? "").trim();
    const snippet = String(row?.snippet ?? "").trim();
    const date = String(row?.date ?? row?.internalDate ?? "").trim();
    return from.length > 0 && subject.length > 0 && snippet.length > 0 && date.length > 0;
  });
  return { rows: kept, dropped: rows.length - kept.length };
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
    id: row?.id,
    threadId: row?.threadId,
    from: findHeader("from"),
    subject: findHeader("subject"),
    snippet: row?.snippet ?? "",
    body: row?.snippet ?? "",
    date: findHeader("date") || "",
    internalDate: row?.internalDate,
  };
}
