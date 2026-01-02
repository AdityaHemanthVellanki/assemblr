import "server-only";

import { cache } from "react";

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

export const getCurrentUser = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.error("supabase getUser failed", { message: error.message });
  }
  const user = data?.user;
  if (!user) throw new PermissionError("Unauthorized", 401);
  return user;
});

export const getSessionContext = cache(async (): Promise<SessionContext> => {
  const supabase = await createSupabaseServerClient();
  const user = await getCurrentUser();

  const loadMembership = async () => {
    return supabase
      .from("memberships")
      .select("org_id, role")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
  };

  let membership = await loadMembership();
  if (!membership.error && !membership.data) {
    await new Promise((r) => setTimeout(r, 250));
    membership = await loadMembership();
  }

  if (process.env.NODE_ENV !== "production") {
    console.log("getSessionContext membership", {
      userId: user.id,
      ok: !membership.error,
      hasMembership: Boolean(membership.data),
      error: membership.error?.message,
      orgId: (membership.data as { org_id?: string } | null)?.org_id ?? null,
    });
  }

  if (membership.error) {
    console.error("load membership failed", {
      userId: user.id,
      message: membership.error.message,
    });
    throw new PermissionError("Failed to load organization membership", 500);
  }

  const orgId = membership.data?.org_id as string | null | undefined;
  if (!orgId || !orgId.trim().length) {
    throw new PermissionError("Workspace provisioning", 503);
  }

  return { userId: user.id, orgId };
});

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

export function canManageIntegrations(role: OrgRole) {
  return role === "owner" || role === "editor";
}

// Phase 9: Governance
export function canCreateWorkflows(role: OrgRole) {
  // Editors can create workflows, but they might need approval
  return role === "owner" || role === "editor";
}

export function canApproveWorkflows(role: OrgRole) {
  // Only owners can approve workflows
  return role === "owner";
}

export function requiresApproval(role: OrgRole, actions: any[]) {
  // Owners bypass approval
  if (role === "owner") return false;
  
  // Editors need approval if workflow has ANY write actions
  if (role === "editor") {
    // Check if actions list contains any side-effect actions
    // For Phase 9, let's assume ALL configured actions are risky except maybe 'log'
    // But our Engine only supports slack/email/github which are all risky.
    return actions.length > 0; 
  }
  
  return true;
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
    .select("id, org_id")
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
    dataSourceId: null,
  };
}
