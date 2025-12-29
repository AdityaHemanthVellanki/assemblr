import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export const ORG_ROLES = ["owner", "editor", "viewer"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

const ORG_ROLE_ORDER: Record<OrgRole, number> = {
  viewer: 0,
  editor: 1,
  owner: 2,
};

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

export async function getCurrentUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.error("supabase getUser failed", { message: error.message });
  }
  const user = data?.user;
  if (!user) throw new PermissionError("Unauthorized", 401);
  return user;
}

export async function getSessionContext(): Promise<SessionContext> {
  const supabase = await createSupabaseServerClient();
  const user = await getCurrentUser();

  const profile = await supabase
    .from("users")
    .select("current_org_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile.error) {
    console.error("load profile failed", { userId: user.id, message: profile.error.message });
    throw new PermissionError("Failed to load profile", 500);
  }

  const orgId = profile.data?.current_org_id as string | null | undefined;
  if (orgId && orgId.trim().length) {
    return { userId: user.id, orgId };
  }

  const bootstrapped = await supabase.rpc("bootstrap_user");
  if (bootstrapped.error || !bootstrapped.data) {
    console.error("bootstrap_user failed", { userId: user.id, message: bootstrapped.error?.message });
    throw new PermissionError("Failed to initialize organization", 500);
  }

  return { userId: user.id, orgId: bootstrapped.data as string };
}

export async function resolveUserRole({
  userId,
  orgId,
}: SessionContext): Promise<OrgRole | null> {
  const supabase = await createSupabaseServerClient();
  const membership = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (membership.error) {
    console.error("resolveUserRole failed", {
      userId,
      orgId,
      message: membership.error.message,
    });
    throw new PermissionError("Failed to resolve user role", 500);
  }
  const role = membership.data?.role as OrgRole | null | undefined;
  return role ?? null;
}

export async function requireUserRole(
  ctx: SessionContext,
): Promise<{ role: OrgRole }> {
  const role = await resolveUserRole(ctx);
  if (!role) throw new PermissionError("Not a member of this organization", 403);
  return { role };
}

export async function getCurrentOrg() {
  const ctx = await getSessionContext();
  return ctx.orgId;
}

export async function requireOrgMember() {
  const ctx = await getSessionContext();
  const { role } = await requireUserRole(ctx);
  return { ctx, role };
}

export async function requireRole(required: "owner" | "editor") {
  const { ctx, role } = await requireOrgMember();
  if (ORG_ROLE_ORDER[role] < ORG_ROLE_ORDER[required]) {
    throw new PermissionError("Insufficient permissions", 403);
  }
  return { ctx, role };
}

export function canViewDashboards(role: OrgRole) {
  return role === "owner" || role === "editor" || role === "viewer";
}

export function canEditProjects(role: OrgRole) {
  return role === "owner" || role === "editor";
}

export function canGenerateSpec(role: OrgRole) {
  return role === "owner" || role === "editor";
}

export function canManageDataSources(role: OrgRole) {
  return role === "owner";
}

export function canManageMembers(role: OrgRole) {
  return role === "owner";
}

export function roleLabel(role: OrgRole) {
  if (role === "owner") return "Owner";
  if (role === "editor") return "Editor";
  return "Viewer";
}

export async function requireProjectOrgAccess(
  ctx: SessionContext,
  projectId: string,
) {
  const supabase = await createSupabaseServerClient();
  const project = await supabase
    .from("projects")
    .select("id, org_id, data_source_id")
    .eq("id", projectId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();

  if (project.error) {
    console.error("requireProjectOrgAccess failed", {
      orgId: ctx.orgId,
      projectId,
      message: project.error.message,
    });
    throw new PermissionError("Failed to load project", 500);
  }

  if (!project.data) throw new PermissionError("Not found", 404);
  return {
    id: project.data.id as string,
    orgId: project.data.org_id as string,
    dataSourceId: (project.data.data_source_id as string | null) ?? null,
  };
}
