import "server-only";

import { cache } from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ORG_ROLES,
  type OrgRole,
  PermissionError,
  canViewDashboards,
  canEditProjects,
  canGenerateSpec,
  canManageDataSources,
  canManageMembers,
  canManageIntegrations,
  canCreateWorkflows,
  canApproveWorkflows,
  requiresApproval,
  roleLabel,
} from "./permissions.client";

const ORG_ROLE_ORDER: Record<OrgRole, number> = {
  viewer: 0,
  editor: 1,
  owner: 2,
};

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
    await new Promise((r) => setTimeout(r, 500));
    membership = await loadMembership();
  }

  if (!membership.error && !membership.data) {
    console.warn("User has no organization. Attempting auto-provisioning...", { userId: user.id });

    const orgName =
      (user.user_metadata?.full_name || user.email?.split("@")[0] || "My Workspace") + "'s Workspace";

    const newOrg = await (supabase.from("organizations") as any)
      .insert({ name: orgName })
      .select()
      .single();

    if (newOrg.data) {
      await (supabase.from("memberships") as any).insert({
        user_id: user.id,
        org_id: newOrg.data.id,
        role: "owner",
      });

      membership = await loadMembership();
    }
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

export {
  ORG_ROLES,
  PermissionError,
  canViewDashboards,
  canEditProjects,
  canGenerateSpec,
  canManageDataSources,
  canManageMembers,
  canManageIntegrations,
  canCreateWorkflows,
  canApproveWorkflows,
  requiresApproval,
  roleLabel,
};

export type { OrgRole };

