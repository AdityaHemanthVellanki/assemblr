import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { z } from "zod";

import { authOptions } from "@/lib/auth/auth-options";
import { buildQueryForView } from "@/lib/data/queryBuilder";
import { getPostgresPool, runReadOnlyQuery } from "@/lib/data/postgres";
import { getCachedSchema } from "@/lib/data/schema";
import { parseDashboardSpec } from "@/lib/dashboard/spec";
import { prisma } from "@/lib/db/prisma";
import { getServerEnv } from "@/lib/env";
import { decryptJson, type EncryptedJson } from "@/lib/security/encryption";
import { checkRateLimit } from "@/lib/security/rate-limit";

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

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = session.user.orgId;
  if (!orgId) return NextResponse.json({ error: "User missing orgId" }, { status: 403 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { id } = await params;

  const rl = checkRateLimit({
    key: `query:${orgId}:${id}`,
    windowMs: 10_000,
    max: 20,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  const project = await prisma.project.findFirst({
    where: { id, orgId },
    select: { id: true, spec: true, dataSourceId: true },
  });

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!project.dataSourceId) {
    return NextResponse.json({ error: "No data source connected" }, { status: 400 });
  }

  const dataSource = await prisma.dataSource.findFirst({
    where: { id: project.dataSourceId, orgId },
    select: { id: true, type: true, config: true },
  });

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
    const spec = parsed.data.spec
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

    if (plan.kind === "metric") {
      const value = res.rows?.[0]?.value;
      const n = typeof value === "number" ? value : Number(value ?? 0);
      return NextResponse.json({
        result: { kind: "metric", value: Number.isFinite(n) ? n : 0 },
      });
    }

    if (plan.kind === "series") {
      const points = (res.rows ?? []).map((r: unknown) => {
        const row = r as { bucket?: unknown; value?: unknown };
        return {
          label: formatBucketLabel(row.bucket),
          value: Number(row.value ?? 0),
        };
      });
      return NextResponse.json({ result: { kind: "series", points } });
    }

    const rows = (res.rows ?? []).map((r: unknown) => {
      const row = r as Record<string, unknown>;
      const obj: Record<string, unknown> = {};
      for (const col of plan.columns) {
        obj[col] = row[col];
      }
      return obj;
    });

    return NextResponse.json({
      result: { kind: "table", columns: plan.columns, rows },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("query failed", {
      orgId,
      projectId: id,
      dataSourceId: project.dataSourceId,
      viewId: parsed.data.viewId,
      message,
    });
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid dashboard spec" }, { status: 422 });
    }
    return NextResponse.json({ error: "Failed to query data" }, { status: 500 });
  }
}
