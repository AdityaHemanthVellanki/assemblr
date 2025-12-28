import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import nodemailer from "nodemailer";

import {
  canManageMembers,
  getSessionContext,
  ORG_ROLES,
  PermissionError,
  requireUserRole,
} from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { getServerEnv } from "@/lib/env";

const bodySchema = z
  .object({
    email: z.string().email().max(320),
    role: z.enum(ORG_ROLES),
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
    const { role } = await requireUserRole(ctx);
    if (!canManageMembers(role)) {
      return NextResponse.json(
        { error: "Only owners can manage members" },
        { status: 403 },
      );
    }
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

  const email = parsed.data.email.trim().toLowerCase();
  const role = parsed.data.role;

  const existingMember = await prisma.membership.findFirst({
    where: { orgId: ctx.orgId, user: { email } },
    select: { id: true },
  });
  if (existingMember) {
    return NextResponse.json(
      { error: "User is already a member of this organization" },
      { status: 400 },
    );
  }

  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.invite.create({
    data: {
      orgId: ctx.orgId,
      email,
      role,
      tokenHash,
      expiresAt,
    },
    select: { id: true },
  });

  const baseUrl =
    process.env.NEXTAUTH_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  const acceptUrl = `${baseUrl}/dashboard/members?invite=${encodeURIComponent(
    token,
  )}`;

  if (process.env.NODE_ENV === "production") {
    if (!process.env.EMAIL_SERVER || !process.env.EMAIL_FROM) {
      return NextResponse.json(
        { error: "Email is not configured" },
        { status: 500 },
      );
    }
    const transport = nodemailer.createTransport(process.env.EMAIL_SERVER);
    await transport.sendMail({
      to: email,
      from: process.env.EMAIL_FROM,
      subject: "You’ve been invited to Assemblr",
      text: `You have been invited to join an Assemblr organization. Accept: ${acceptUrl}`,
      html: `<p>You have been invited to join an Assemblr organization.</p><p><a href="${acceptUrl}">Accept invite</a></p>`,
    });
  }

  return NextResponse.json(
    {
      invite: {
        email,
        role,
        expiresAt: expiresAt.toISOString(),
        acceptUrl:
          process.env.NODE_ENV === "production" ? undefined : acceptUrl,
      },
    },
    { status: 201 },
  );
}
