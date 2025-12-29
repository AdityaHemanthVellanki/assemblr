import { NextResponse } from "next/server";

import {
  PermissionError,
  requireOrgMember,
} from "@/lib/auth/permissions";
import { getServerEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  getServerEnv();

  type OrgMemberRow = {
    user_id: string;
    role: string;
    created_at: string;
    email: string | null;
    name: string | null;
  };

  try {
    const { ctx, role } = await requireOrgMember();

    const supabase = await createSupabaseServerClient();
    const membersRes = await supabase.rpc("list_org_members", {
      p_org_id: ctx.orgId,
    });

    if (membersRes.error) {
      console.error("list members failed", {
        userId: ctx.userId,
        orgId: ctx.orgId,
        message: membersRes.error.message,
      });
      return NextResponse.json({ error: "Failed to load members" }, { status: 500 });
    }

    const rows = (membersRes.data ?? []) as OrgMemberRow[];

    return NextResponse.json({
      me: { userId: ctx.userId, role },
      members: rows.map((m) => ({
        userId: m.user_id,
        role: m.role,
        createdAt: new Date(m.created_at),
        email: m.email,
        name: m.name,
      })),
    });
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
