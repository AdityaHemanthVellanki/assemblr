import "server-only";

export type MemoryScope =
  | { type: "tool"; toolId: string }
  | { type: "tool_user"; toolId: string; userId: string }
  | { type: "tool_org"; toolId: string; orgId: string }
  | { type: "session"; sessionId: string }
  | { type: "user"; userId: string }
  | { type: "org"; orgId: string };

export type MemoryReadParams = {
  scope: MemoryScope;
  namespace: string;
  key: string;
};

export type MemoryWriteParams = {
  scope: MemoryScope;
  namespace: string;
  key: string;
  value: any;
};

export type MemoryDeleteParams = {
  scope: MemoryScope;
  namespace: string;
  key: string;
};

export interface MemoryAdapter {
  get(params: MemoryReadParams): Promise<any>;
  set(params: MemoryWriteParams): Promise<void>;
  delete(params: MemoryDeleteParams): Promise<void>;
}

export type MemoryAdapterErrorKind = "missing_table" | "unknown";

export class MemoryAdapterError extends Error {
  kind: MemoryAdapterErrorKind;
  code?: string;
  table?: string;

  constructor(kind: MemoryAdapterErrorKind, message: string, options?: { code?: string; table?: string }) {
    super(message);
    this.kind = kind;
    this.code = options?.code;
    this.table = options?.table;
  }
}

export function getMissingMemoryTableError(err: unknown, tableNames: string[]) {
  const code = typeof (err as any)?.code === "string" ? (err as any).code : undefined;
  const message = typeof (err as any)?.message === "string" ? (err as any).message : "";
  if (code === "42P01") {
    return new MemoryAdapterError("missing_table", message || "Missing memory table", { code });
  }
  const lower = message.toLowerCase();
  const matchesTable = tableNames.some((t) => lower.includes(`public.${t}`));
  const matchesMissing =
    lower.includes("could not find the table") ||
    lower.includes("does not exist") ||
    lower.includes("schema cache");
  if (matchesTable && matchesMissing) {
    const table = tableNames.find((t) => lower.includes(`public.${t}`));
    return new MemoryAdapterError("missing_table", message || "Missing memory table", { table });
  }
  return null;
}
