import { NextResponse } from "next/server";
import { z } from "zod";

import {
  canEditProjects,
  PermissionError,
  requireOrgMember,
} from "@/lib/permissions";
import { buildQueryForView } from "@/lib/data/queryBuilder";
import { getPostgresPool, runReadOnlyQuery } from "@/lib/data/postgres";
import { getCachedSchema } from "@/lib/data/schema";
import { parseDashboardSpec } from "@/lib/dashboard/spec";
import { getServerEnv } from "@/lib/env";
import { decryptJson, type EncryptedJson } from "@/lib/security/encryption";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const bodySchema = z
  .object({
    viewId: z.string().min(1),
    spec: z.unknown().optional(),
  })
  .strict();

type PostgresConfigEnvelope = {
  v: 1;
  kind: "postgres";
  payload: EncryptedJson;
};

const envelopeSchema = z.object({
  v: z.literal(1),
  kind: z.literal("postgres"),
  payload: z.unknown(),
});

const payloadSchema = z.object({
  v: z.literal(1),
  alg: z.literal("aes-256-gcm"),
  iv: z.string(),
  tag: z.string(),
  ciphertext: z.string(),
});

function formatBucketLabel(value: unknown) {
  const date =
    value instanceof Date
      ? value
      : typeof value === "string" || typeof value === "number"
        ? new Date(value)
        : null;
  if (!date || Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().slice(0, 10);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  getServerEnv();

  let ctx: Awaited<ReturnType<typeof requireOrgMember>>["ctx"];
  let role: Awaited<ReturnType<typeof requireOrgMember>>["role"];
  try {
    ({ ctx, role } = await requireOrgMember());
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { id } = await params;

  const rl = checkRateLimit({
    key: `query:${ctx.orgId}:${id}`,
    windowMs: 10_000,
    max: 20,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  const supabase = await createSupabaseServerClient();
  const projectRes = await supabase
    .from("projects")
    .select("id, spec, data_source_id")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();

  if (projectRes.error) {
    console.error("load project failed", {
      orgId: ctx.orgId,
      projectId: id,
      message: projectRes.error.message,
    });
    return NextResponse.json({ error: "Failed to load project" }, { status: 500 });
  }
  const project = projectRes.data as
    | { id: string; spec: unknown; data_source_id: string | null }
    | null;

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!project.data_source_id) {
    return NextResponse.json({ error: "No data source connected" }, { status: 400 });
  }

  const dataSourceRes = await supabase
    .from("data_sources")
    .select("id, type, config")
    .eq("id", project.data_source_id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();

  if (dataSourceRes.error) {
    console.error("load data source failed", {
      orgId: ctx.orgId,
      projectId: id,
      dataSourceId: project.data_source_id,
      message: dataSourceRes.error.message,
    });
    return NextResponse.json({ error: "Failed to load data source" }, { status: 500 });
  }
  const dataSource = dataSourceRes.data as
    | { id: string; type: string; config: unknown }
    | null;

  if (!dataSource) return NextResponse.json({ error: "No data source connected" }, { status: 400 });
  if (dataSource.type !== "postgres") {
    return NextResponse.json({ error: "Unsupported data source type" }, { status: 400 });
  }

  let creds: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl?: boolean;
  };
  try {
    const envelope = envelopeSchema.parse(dataSource.config) as PostgresConfigEnvelope;
    const payload = payloadSchema.parse(envelope.payload) as EncryptedJson;
    creds = decryptJson(payload);
  } catch {
    return NextResponse.json({ error: "Invalid data source config" }, { status: 500 });
  }

  try {
    const allowDraftSpec = canEditProjects(role);
    const spec =
      allowDraftSpec && parsed.data.spec
        ? parseDashboardSpec(parsed.data.spec)
        : parseDashboardSpec(project.spec);

    const pool = getPostgresPool({ dataSourceId: dataSource.id, credentials: creds });
    const schema = await getCachedSchema({ dataSourceId: dataSource.id, pool });

    let plan: ReturnType<typeof buildQueryForView>;
    try {
      plan = buildQueryForView({
        spec,
        viewId: parsed.data.viewId,
        schema,
        maxRows: 1000,
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Invalid view" },
        { status: 400 },
      );
    }

    const res = await runReadOnlyQuery({
      pool,
      query: plan.query,
      timeoutMs: 3_000,
    });
    if (!Array.isArray(res.rows)) {
      throw new Error("Query failed");
    }
    const rows = res.rows;

    if (plan.kind === "metric") {
      const value = (rows[0] as { value?: unknown } | undefined)?.value;
      const n = typeof value === "number" ? value : Number(value ?? 0);
      return NextResponse.json({
        result: { kind: "metric", value: Number.isFinite(n) ? n : 0 },
      });
    }

    if (plan.kind === "series") {
      const points = rows.map((r: unknown) => {
        const row = r as { bucket?: unknown; value?: unknown };
        return {
          label: formatBucketLabel(row.bucket),
          value: Number(row.value ?? 0),
        };
      });
      return NextResponse.json({ result: { kind: "series", points } });
    }

    const outputRows = rows.map((r: unknown) => {
      const row = r as Record<string, unknown>;
      const obj: Record<string, unknown> = {};
      for (const col of plan.columns) {
        obj[col] = row[col];
      }
      return obj;
    });

    return NextResponse.json({
      result: { kind: "table", columns: plan.columns, rows: outputRows },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("query failed", {
      orgId: ctx.orgId,
      projectId: id,
      dataSourceId: project.data_source_id,
      viewId: parsed.data.viewId,
      message,
    });
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid dashboard spec" }, { status: 422 });
    }
    return NextResponse.json({ error: "Failed to query data" }, { status: 500 });
  }
}
