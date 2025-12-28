import { NextResponse } from "next/server";

import {
  getSessionContext,
  PermissionError,
  requireUserRole,
} from "@/lib/auth/permissions";
import { getServerEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  getServerEnv();

  try {
    const ctx = await getSessionContext();
    const { role } = await requireUserRole(ctx);

    const supabase = await createSupabaseServerClient();
    const membersRes = await supabase
      .from("memberships")
      .select("user_id, role, created_at, profiles(email, name)")
      .eq("org_id", ctx.orgId)
      .order("created_at", { ascending: true });

    if (membersRes.error) {
      console.error("list members failed", {
        userId: ctx.userId,
        orgId: ctx.orgId,
        message: membersRes.error.message,
      });
      return NextResponse.json({ error: "Failed to load members" }, { status: 500 });
    }

    return NextResponse.json({
      me: { userId: ctx.userId, role },
      members: (membersRes.data ?? []).map((m) => {
        const profile = (m as { profiles?: unknown }).profiles as
          | { email?: string | null; name?: string | null }
          | null
          | undefined;
        return {
          userId: (m as { user_id: string }).user_id,
          role: (m as { role: string }).role,
          createdAt: new Date((m as { created_at: string }).created_at),
          email: profile?.email ?? null,
          name: profile?.name ?? null,
        };
      }),
    });
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
