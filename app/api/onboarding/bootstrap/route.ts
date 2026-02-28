import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/onboarding/bootstrap
 * Ensures the authenticated user has an org + membership.
 * Called by the onboarding page on mount so OAuth flows work.
 */
export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user already has a membership
    const { data: membership } = await supabase
      .from("memberships")
      .select("org_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (membership?.org_id) {
      return NextResponse.json({ status: "ok", orgId: membership.org_id });
    }

    // No org — provision one using admin client (bypasses RLS)
    console.log(
      `[Bootstrap] No org found for user ${user.id}, provisioning...`,
    );
    const admin = createSupabaseAdminClient();

    const userName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split("@")[0] ||
      "User";

    // 1. Ensure user record exists (memberships FK requires it)
    const { error: userErr } = await admin
      .from("users")
      .upsert(
        { id: user.id, email: user.email, name: userName },
        { onConflict: "id" },
      );
    if (userErr) {
      console.error("[Bootstrap] Failed to upsert user:", userErr.message);
      return NextResponse.json(
        { error: `User upsert failed: ${userErr.message}` },
        { status: 500 },
      );
    }

    // 2. Ensure profile exists (profiles table: id, name, avatar_url — NO email)
    const { error: profileErr } = await admin
      .from("profiles")
      .upsert(
        {
          id: user.id,
          name: userName,
          avatar_url: user.user_metadata?.avatar_url || null,
        },
        { onConflict: "id" },
      );
    if (profileErr) {
      console.error("[Bootstrap] Failed to upsert profile:", profileErr.message);
    }

    // 3. Create org
    const { data: newOrg, error: orgErr } = await admin
      .from("orgs")
      .insert({ name: `${userName}'s Workspace` })
      .select("id")
      .single();

    if (orgErr || !newOrg?.id) {
      console.error("[Bootstrap] Failed to create org:", orgErr?.message);
      return NextResponse.json(
        { error: `Org creation failed: ${orgErr?.message}` },
        { status: 500 },
      );
    }

    // 4. Create membership
    const { error: memberErr } = await admin
      .from("memberships")
      .insert({ user_id: user.id, org_id: newOrg.id, role: "owner" });

    if (memberErr) {
      console.error(
        "[Bootstrap] Failed to create membership:",
        memberErr.message,
      );
      return NextResponse.json(
        { error: `Membership creation failed: ${memberErr.message}` },
        { status: 500 },
      );
    }

    console.log(
      `[Bootstrap] Auto-provisioned org ${newOrg.id} for user ${user.id}`,
    );
    return NextResponse.json({ status: "ok", orgId: newOrg.id });
  } catch (err: any) {
    console.error("[Bootstrap] Unexpected error:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
