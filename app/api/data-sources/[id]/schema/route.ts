import { NextResponse } from "next/server";
import { z } from "zod";

import {
  canManageDataSources,
  getSessionContext,
  type OrgRole,
  PermissionError,
  requireUserRole,
} from "@/lib/auth/permissions";
import { getPostgresPool } from "@/lib/data/postgres";
import { getCachedSchema } from "@/lib/data/schema";
import { getServerEnv } from "@/lib/env";
import { decryptJson, type EncryptedJson } from "@/lib/security/encryption";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const { id } = await params;

  const rl = checkRateLimit({
    key: `schema:${ctx.orgId}:${id}`,
    windowMs: 60_000,
    max: 20,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  const supabase = await createSupabaseServerClient();
  const dataSourceRes = await supabase
    .from("data_sources")
    .select("id, type, config")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();

  if (dataSourceRes.error) {
    console.error("load data source failed", {
      orgId: ctx.orgId,
      dataSourceId: id,
      message: dataSourceRes.error.message,
    });
    return NextResponse.json({ error: "Failed to load data source" }, { status: 500 });
  }

  const dataSource = dataSourceRes.data as
    | { id: string; type: string; config: unknown }
    | null;

  if (!dataSource) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (dataSource.type !== "postgres") {
    return NextResponse.json({ error: "Unsupported data source type" }, { status: 400 });
  }

  const envelopeResult = z
    .object({
      v: z.literal(1),
      kind: z.literal("postgres"),
      payload: z.unknown(),
    })
    .safeParse(dataSource.config);

  if (!envelopeResult.success) {
    return NextResponse.json({ error: "Invalid data source config" }, { status: 500 });
  }

  const payloadResult = z
    .object({
      v: z.literal(1),
      alg: z.literal("aes-256-gcm"),
      iv: z.string(),
      tag: z.string(),
      ciphertext: z.string(),
    })
    .safeParse(envelopeResult.data.payload);

  if (!payloadResult.success) {
    return NextResponse.json({ error: "Invalid data source config" }, { status: 500 });
  }

  try {
    const creds = decryptJson<{
      host: string;
      port: number;
      database: string;
      user: string;
      password: string;
      ssl?: boolean;
    }>(payloadResult.data as EncryptedJson);

    const pool = getPostgresPool({ dataSourceId: dataSource.id, credentials: creds });
    const schema = await getCachedSchema({ dataSourceId: dataSource.id, pool });

    return NextResponse.json({ schema });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("introspect schema failed", {
      orgId: ctx.orgId,
      dataSourceId: id,
      message,
    });
    return NextResponse.json({ error: "Failed to introspect schema" }, { status: 500 });
  }
}
