import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { z } from "zod";

import { authOptions } from "@/lib/auth/auth-options";
import { getPostgresPool } from "@/lib/data/postgres";
import { getCachedSchema } from "@/lib/data/schema";
import { prisma } from "@/lib/db/prisma";
import { getServerEnv } from "@/lib/env";
import { decryptJson, type EncryptedJson } from "@/lib/security/encryption";
import { checkRateLimit } from "@/lib/security/rate-limit";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  getServerEnv();

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = session.user.orgId;
  if (!orgId) return NextResponse.json({ error: "User missing orgId" }, { status: 403 });

  const { id } = await params;

  const rl = checkRateLimit({
    key: `schema:${orgId}:${id}`,
    windowMs: 60_000,
    max: 20,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  const dataSource = await prisma.dataSource.findFirst({
    where: { id, orgId },
    select: { id: true, type: true, config: true },
  });

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
    console.error("introspect schema failed", { orgId, dataSourceId: id, message });
    return NextResponse.json({ error: "Failed to introspect schema" }, { status: 500 });
  }
}
