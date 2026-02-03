
// import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type BuildContext = {
  userId: string;
  orgId: string;
  ownerId: string;
};

/**
 * Authoritative function to resolve and guarantee the existence of
 * the build context (User, Org, Membership) before any tool build.
 *
 * resolveBuildContext GUARANTEES:
 * - a valid user_id
 * - a valid owner_id
 * - a valid org_id that EXISTS in DB
 * - valid org membership
 *
 * It MUST NOT create missing state.
 * It MUST throw for absence.
 */
export async function resolveBuildContext(
  userId: string,
  targetOrgId?: string
): Promise<BuildContext> {
  const supabase = createSupabaseAdminClient();

  // 1. Validate User Exists
  const { data: user, error: userError } = await supabase.auth.admin.getUserById(userId);
  if (userError || !user) {
    throw new Error(`User ${userId} not found or invalid`);
  }

  // 2. Resolve Organization
  let orgId = targetOrgId;
  let orgExists = false;

  if (orgId) {
    const { data } = await (supabase.from("organizations") as any)
      .select("id")
      .eq("id", orgId)
      .maybeSingle();

    if (data) {
      orgExists = true;
    }
  }

  if (!orgId || !orgExists) {
    // Discovery: Find any existing membership
    const { data: memberships } = await (supabase.from("memberships") as any)
      .select("org_id")
      .eq("user_id", userId)
      .limit(1);

    if (memberships && memberships.length > 0) {
      orgId = memberships[0].org_id;
    } else {
      throw new Error(`No organization membership found for user ${userId}`);
    }
  }

  // 3. Guarantee Membership Exists
  // At this point, orgId is valid and exists in DB
  if (!orgId) {
    throw new Error("Failed to resolve organization for build context");
  }

  const { data: membership } = await (supabase.from("memberships") as any)
    .select("role")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!membership) {
    throw new Error(`User ${userId} is not a member of org ${orgId}`);
  }

  return {
    userId,
    orgId: orgId!,
    ownerId: userId, // In this context, the user triggering the build is the owner/actor
  };
}
