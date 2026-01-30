
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
 * It MUST create missing state.
 * It MUST NOT throw for absence.
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

  // 2. Resolve or Create Organization
  let orgId = targetOrgId;
  let orgExists = false;

  if (orgId) {
    const { data } = await (supabase.from("organizations") as any)
      .select("id")
      .eq("id", orgId)
      .maybeSingle();

    if (data) {
      orgExists = true;
    } else {
      const { data: createdOrg, error: createError } = await (supabase.from("organizations") as any)
        .upsert(
          {
            id: orgId,
            name: `${user.user.email ?? "User"}'s Workspace`,
          },
          { onConflict: "id" },
        )
        .select("id")
        .single();

      if (createError || !createdOrg) {
        throw new Error(`Failed to create organization ${orgId}: ${createError?.message}`);
      }
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
      // Create a completely new bootstrap organization
      const { data: newOrg, error: createError } = await (supabase.from("organizations") as any)
        .insert({
          name: `${user.user.email ?? "User"}'s Workspace`,
        })
        .select("id")
        .single();

      if (createError || !newOrg) {
        // This is a catastrophic failure of the DB if we can't even create a fresh org
        throw new Error(`Failed to create bootstrap organization: ${createError?.message}`);
      }
      orgId = newOrg.id;
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
    const { error: joinError } = await (supabase.from("memberships") as any).insert({
      user_id: userId,
      org_id: orgId,
      role: "owner",
    });
    if (joinError && joinError.code !== "23505") {
      throw new Error(`Failed to create membership for ${userId} in ${orgId}`);
    }
  }

  return {
    userId,
    orgId: orgId!,
    ownerId: userId, // In this context, the user triggering the build is the owner/actor
  };
}
