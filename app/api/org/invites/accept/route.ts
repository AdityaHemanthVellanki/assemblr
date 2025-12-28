import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";

import { getSessionContext, PermissionError } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { getServerEnv } from "@/lib/env";

const bodySchema = z
  .object({
    token: z.string().min(16),
  })
  .strict();

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function POST(req: Request) {
  getServerEnv();

  let ctx: Awaited<ReturnType<typeof getSessionContext>>;
  try {
    ctx = await getSessionContext();
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

  const tokenHash = hashToken(parsed.data.token);

  const me = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { id: true, email: true, orgId: true },
  });
  if (!me?.email) {
    return NextResponse.json({ error: "User missing email" }, { status: 400 });
  }

  const invite = await prisma.invite.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      orgId: true,
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
    },
  });

  if (!invite || invite.acceptedAt) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "Invite has expired" }, { status: 400 });
  }
  if (invite.email.toLowerCase() !== me.email.toLowerCase()) {
    return NextResponse.json(
      { error: "Invite email does not match signed-in user" },
      { status: 403 },
    );
  }

  await prisma.$transaction(async (tx) => {
    if (me.orgId && me.orgId !== invite.orgId) {
      const myMembership = await tx.membership.findUnique({
        where: { userId_orgId: { userId: me.id, orgId: me.orgId } },
        select: { role: true },
      });
      if (myMembership?.role === "OWNER") {
        const ownerCount = await tx.membership.count({
          where: { orgId: me.orgId, role: "OWNER" },
        });
        if (ownerCount === 1) {
          throw new Error("Cannot leave organization as the last owner");
        }
      }
      await tx.membership.deleteMany({
        where: { userId: me.id, orgId: me.orgId },
      });
    }

    await tx.user.update({
      where: { id: me.id },
      data: { orgId: invite.orgId },
    });

    await tx.membership.upsert({
      where: { userId_orgId: { userId: me.id, orgId: invite.orgId } },
      create: { userId: me.id, orgId: invite.orgId, role: invite.role },
      update: { role: invite.role },
      select: { id: true },
    });

    await tx.invite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date(), acceptedByUserId: me.id },
      select: { id: true },
    });
  });

  return NextResponse.json({ ok: true });
}
