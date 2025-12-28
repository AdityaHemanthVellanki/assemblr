import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

async function bootstrapOrgForUser(input: { userId: string; email?: string | null; name?: string | null }) {
  const admin = createSupabaseAdminClient();
  const domain = input.email?.split("@")[1];
  const name = domain && domain.trim().length ? domain : "Personal";

  const orgCreate = await admin
    .from("organizations")
    .insert({ name })
    .select("id")
    .single();
  if (orgCreate.error || !orgCreate.data?.id) {
    throw new PermissionError("Failed to create organization", 500);
  }

  const orgId = orgCreate.data.id as string;

  const membershipCreate = await admin.from("memberships").insert({
    user_id: input.userId,
    org_id: orgId,
    role: "OWNER",
  });
  if (membershipCreate.error) {
    throw new PermissionError("Failed to create membership", 500);
  }

  const profileUpsert = await admin.from("profiles").upsert(
    {
      id: input.userId,
      email: input.email ?? null,
      name: input.name ?? null,
      current_org_id: orgId,
    },
    { onConflict: "id" },
  );
  if (profileUpsert.error) {
    throw new PermissionError("Failed to create profile", 500);
  }

  return orgId;
}

function getUserDisplayName(user: { user_metadata?: unknown }) {
  const meta = user.user_metadata;
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;
  const raw = typeof m.full_name === "string" ? m.full_name : typeof m.name === "string" ? m.name : null;
  const normalized = typeof raw === "string" ? raw.trim() : "";
  return normalized.length ? normalized : null;
}

export async function getSessionContext(): Promise<SessionContext> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.error("supabase getUser failed", { message: error.message });
  }
  const user = data?.user;
  if (!user) throw new PermissionError("Unauthorized", 401);

  const profile = await supabase
    .from("profiles")
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

  const bootstrappedOrgId = await bootstrapOrgForUser({
    userId: user.id,
    email: user.email,
    name: getUserDisplayName(user),
  });

  return { userId: user.id, orgId: bootstrappedOrgId };
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

export async function requireOwnerCountAtLeastOne(orgId: string) {
  const admin = createSupabaseAdminClient();
  const res = await admin
    .from("memberships")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("role", "OWNER");
  if (res.error) {
    console.error("requireOwnerCountAtLeastOne failed", { orgId, message: res.error.message });
    throw new PermissionError("Failed to validate owner count", 500);
  }
  if ((res.count ?? 0) < 1) {
    throw new PermissionError("Organization must have at least one owner", 400);
  }
}
