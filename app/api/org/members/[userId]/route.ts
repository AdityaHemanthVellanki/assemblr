import { NextResponse } from "next/server";
import { z } from "zod";

import {
  canManageMembers,
  getSessionContext,
  ORG_ROLES,
  PermissionError,
  requireUserRole,
} from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { getServerEnv } from "@/lib/env";

const patchSchema = z
  .object({
    role: z.enum(ORG_ROLES),
  })
  .strict();

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
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
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { userId } = await params;

  const membership = await prisma.membership.findUnique({
    where: { userId_orgId: { userId, orgId: ctx.orgId } },
    select: { id: true, role: true },
  });
  if (!membership) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const nextRole = parsed.data.role;

  if (userId === ctx.userId && membership.role === "OWNER" && nextRole !== "OWNER") {
    const ownerCount = await prisma.membership.count({
      where: { orgId: ctx.orgId, role: "OWNER" },
    });
    if (ownerCount === 1) {
      return NextResponse.json(
        { error: "Cannot downgrade the last owner" },
        { status: 400 },
      );
    }
  }

  if (membership.role === "OWNER" && nextRole !== "OWNER") {
    const ownerCount = await prisma.membership.count({
      where: { orgId: ctx.orgId, role: "OWNER" },
    });
    if (ownerCount === 1) {
      return NextResponse.json(
        { error: "Organization must have at least one owner" },
        { status: 400 },
      );
    }
  }

  const updated = await prisma.membership.update({
    where: { userId_orgId: { userId, orgId: ctx.orgId } },
    data: { role: nextRole },
    select: { userId: true, role: true },
  });

  return NextResponse.json({ member: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
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

  const { userId } = await params;

  const membership = await prisma.membership.findUnique({
    where: { userId_orgId: { userId, orgId: ctx.orgId } },
    select: { role: true },
  });
  if (!membership) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (membership.role === "OWNER") {
    const ownerCount = await prisma.membership.count({
      where: { orgId: ctx.orgId, role: "OWNER" },
    });
    if (ownerCount === 1) {
      return NextResponse.json(
        { error: "Cannot remove the last owner" },
        { status: 400 },
      );
    }
  }

  await prisma.membership.delete({
    where: { userId_orgId: { userId, orgId: ctx.orgId } },
    select: { id: true },
  });

  if (userId === ctx.userId) {
    await prisma.user.update({
      where: { id: ctx.userId },
      data: { orgId: null },
      select: { id: true },
    });
  }

  return NextResponse.json({ ok: true });
}

