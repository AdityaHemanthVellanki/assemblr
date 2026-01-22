import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getRequestContext, getOptionalRequestContext, RequestContext } from "@/lib/api/context";
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

export type SessionContext = RequestContext;

// Deprecated: Use getRequestContext() directly
export const getCurrentUser = cache(async () => {
  const ctx = await getRequestContext();
  return ctx.user;
});

// Deprecated: Use getRequestContext() directly
export const getSessionContext = cache(async (): Promise<SessionContext> => {
  return await getRequestContext();
});

// Deprecated: Use getRequestContext() directly
export async function requireOrgMember() {
  const ctx = await getRequestContext();
  return { ctx, role: ctx.org.role as OrgRole };
}

export async function requireOrgMemberOptional() {
  return await getOptionalRequestContext();
}

export async function requireRole(minRole: OrgRole) {
  const ctx = await getRequestContext();
  const userRole = ctx.org.role as OrgRole;
  
  if ((ORG_ROLE_ORDER[userRole] ?? -1) < ORG_ROLE_ORDER[minRole]) {
    throw new PermissionError(`Requires ${roleLabel(minRole)} role`, 403);
  }

  return { ctx, role: userRole };
}

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function requireProjectOrgAccess(
  ctx: SessionContext,
  projectId: string,
) {
  // Use Admin Client to check project existence and ownership
  // This avoids RLS complexity and cookie dependency for this check
  const supabase = createSupabaseAdminClient();
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
export { getRequestContext };
