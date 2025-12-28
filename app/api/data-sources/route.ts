import { NextResponse } from "next/server";
import { z } from "zod";

import {
  canManageDataSources,
  getSessionContext,
  type OrgRole,
  PermissionError,
  requireUserRole,
} from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { getServerEnv } from "@/lib/env";
import { decryptJson, encryptJson, type EncryptedJson } from "@/lib/security/encryption";
import { getPostgresPool, testPostgresConnection } from "@/lib/data/postgres";
import { checkRateLimit } from "@/lib/security/rate-limit";

const createSchema = z
  .object({
    type: z.literal("postgres"),
    name: z.string().min(1).max(80),
    host: z.string().min(1).max(255),
    port: z.number().int().min(1).max(65535).default(5432),
    database: z.string().min(1).max(128),
    user: z.string().min(1).max(128),
    password: z.string().min(1).max(256),
    ssl: z.boolean().optional(),
  })
  .strict();

type PostgresConfigEnvelope = {
  v: 1;
  kind: "postgres";
  payload: EncryptedJson;
};

export async function GET() {
  getServerEnv();

  let ctx: Awaited<ReturnType<typeof getSessionContext>>;
  let role: OrgRole;
  try {
    ctx = await getSessionContext();
    ({ role } = await requireUserRole(ctx));
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  if (!canManageDataSources(role)) {
    return NextResponse.json({ error: "Only owners can manage data sources" }, { status: 403 });
  }

  const dataSources = await prisma.dataSource.findMany({
    where: { orgId: ctx.orgId },
    select: { id: true, type: true, name: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ dataSources });
}

export async function POST(req: Request) {
  const env = getServerEnv();

  let ctx: Awaited<ReturnType<typeof getSessionContext>>;
  let role: OrgRole;
  try {
    ctx = await getSessionContext();
    ({ role } = await requireUserRole(ctx));
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  if (!canManageDataSources(role)) {
    return NextResponse.json({ error: "Only owners can manage data sources" }, { status: 403 });
  }

  const rl = checkRateLimit({
    key: `create-data-source:${ctx.orgId}`,
    windowMs: 60_000,
    max: 10,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  if (!env.DATA_ENCRYPTION_KEY) {
    return NextResponse.json({ error: "Encryption is not configured" }, { status: 500 });
  }

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const input = parsed.data;

  try {
    const envelope: PostgresConfigEnvelope = {
      v: 1,
      kind: "postgres",
      payload: encryptJson({
        host: input.host,
        port: input.port,
        database: input.database,
        user: input.user,
        password: input.password,
        ssl: input.ssl ?? false,
      }),
    };

    const created = await prisma.dataSource.create({
      data: {
        orgId: ctx.orgId,
        type: input.type,
        name: input.name,
        config: envelope,
      },
      select: { id: true, type: true, name: true, createdAt: true, config: true },
    });

    const creds = decryptJson<{
      host: string;
      port: number;
      database: string;
      user: string;
      password: string;
      ssl?: boolean;
    }>((created.config as PostgresConfigEnvelope).payload);

    const pool = getPostgresPool({ dataSourceId: created.id, credentials: creds });
    await testPostgresConnection(pool);

    return NextResponse.json({
      dataSource: { id: created.id, type: created.type, name: created.name, createdAt: created.createdAt },
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("create data source failed", { orgId: ctx.orgId, message });
    return NextResponse.json({ error: "Failed to connect to database" }, { status: 400 });
  }
}
