import "server-only";

import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth/auth-options";
import { prisma } from "@/lib/db/prisma";

export const ORG_ROLES = ["OWNER", "EDITOR", "VIEWER"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export class PermissionError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

export type SessionContext = {
  userId: string;
  orgId: string;
};

export async function getSessionContext(): Promise<SessionContext> {
  const session = await getServerSession(authOptions);
  if (!session) throw new PermissionError("Unauthorized", 401);
  const orgId = session.user.orgId;
  if (!orgId) throw new PermissionError("User missing orgId", 403);
  return { userId: session.user.id, orgId };
}

export async function resolveUserRole({
  userId,
  orgId,
}: SessionContext): Promise<OrgRole | null> {
  const membership = await prisma.membership.findUnique({
    where: { userId_orgId: { userId, orgId } },
    select: { role: true },
  });
  return (membership?.role as OrgRole | undefined) ?? null;
}

export async function requireUserRole(
  ctx: SessionContext,
): Promise<{ role: OrgRole }> {
  const role = await resolveUserRole(ctx);
  if (!role) throw new PermissionError("Not a member of this organization", 403);
  return { role };
}

export function canViewDashboards(role: OrgRole) {
  return role === "OWNER" || role === "EDITOR" || role === "VIEWER";
}

export function canEditProjects(role: OrgRole) {
  return role === "OWNER" || role === "EDITOR";
}

export function canGenerateSpec(role: OrgRole) {
  return role === "OWNER" || role === "EDITOR";
}

export function canManageDataSources(role: OrgRole) {
  return role === "OWNER";
}

export function canManageMembers(role: OrgRole) {
  return role === "OWNER";
}

export function roleLabel(role: OrgRole) {
  if (role === "OWNER") return "Owner";
  if (role === "EDITOR") return "Editor";
  return "Viewer";
}

export async function requireProjectOrgAccess(
  ctx: SessionContext,
  projectId: string,
) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, orgId: ctx.orgId },
    select: { id: true, orgId: true, dataSourceId: true },
  });
  if (!project) throw new PermissionError("Not found", 404);
  return project;
}

export async function requireOwnerCountAtLeastOne(orgId: string) {
  const ownerCount = await prisma.membership.count({
    where: { orgId, role: "OWNER" },
  });
  if (ownerCount < 1) {
    throw new PermissionError("Organization must have at least one owner", 400);
  }
}
