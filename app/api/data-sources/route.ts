import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";

import {
  PermissionError,
  requireRole,
} from "@/lib/auth/permissions";
import { getServerEnv } from "@/lib/env";
import { encryptJson, type EncryptedJson } from "@/lib/security/encryption";
import { getPostgresPool, testPostgresConnection } from "@/lib/data/postgres";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

  let ctx: Awaited<ReturnType<typeof requireRole>>["ctx"];
  try {
    ({ ctx } = await requireRole("owner"));
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const supabase = await createSupabaseServerClient();
  const dataSourcesRes = await supabase
    .from("data_sources")
    .select("id, type, name, created_at")
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false });

  if (dataSourcesRes.error) {
    console.error("list data sources failed", {
      userId: ctx.userId,
      orgId: ctx.orgId,
      message: dataSourcesRes.error.message,
    });
    return NextResponse.json({ error: "Failed to load data sources" }, { status: 500 });
  }

  if (!dataSourcesRes.data) {
    throw new Error("Failed to load data sources");
  }

  const dataSources = dataSourcesRes.data.map((ds) => ({
    id: ds.id as string,
    type: ds.type as string,
    name: ds.name as string,
    createdAt: new Date(ds.created_at as string),
  }));

  return NextResponse.json({ dataSources });
}

export async function POST(req: Request) {
  const env = getServerEnv();

  let ctx: Awaited<ReturnType<typeof requireRole>>["ctx"];
  try {
    ({ ctx } = await requireRole("owner"));
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
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
    const pool = getPostgresPool({
      dataSourceId: crypto.randomUUID(),
      credentials: {
        host: input.host,
        port: input.port,
        database: input.database,
        user: input.user,
        password: input.password,
        ssl: input.ssl ?? false,
      },
    });
    await testPostgresConnection(pool);

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

    const supabase = await createSupabaseServerClient();
    const createdRes = await supabase
      .from("data_sources")
      .insert({
        org_id: ctx.orgId,
        type: input.type,
        name: input.name,
        config: envelope,
      })
      .select("id, type, name, created_at")
      .single();

    if (createdRes.error || !createdRes.data?.id) {
      console.error("create data source failed", {
        orgId: ctx.orgId,
        message: createdRes.error?.message,
      });
      return NextResponse.json({ error: "Failed to create data source" }, { status: 500 });
    }

    return NextResponse.json({
      dataSource: {
        id: createdRes.data.id as string,
        type: createdRes.data.type as string,
        name: createdRes.data.name as string,
        createdAt: new Date(createdRes.data.created_at as string),
      },
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("create data source failed", { orgId: ctx.orgId, message });
    return NextResponse.json({ error: "Failed to connect to database" }, { status: 400 });
  }
}
