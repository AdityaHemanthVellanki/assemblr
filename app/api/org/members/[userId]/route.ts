import { NextResponse } from "next/server";
import { z } from "zod";

import {
  canManageMembers,
  getSessionContext,
  ORG_ROLES,
  PermissionError,
  requireUserRole,
} from "@/lib/auth/permissions";
import { getServerEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const patchSchema = z
  .object({
    role: z.enum(ORG_ROLES),
  })
  .strict();

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  getServerEnv();

  let ctx: Awaited<ReturnType<typeof getSessionContext>>;
  try {
    ctx = await getSessionContext();
    const { role } = await requireUserRole(ctx);
    if (!canManageMembers(role)) {
      return NextResponse.json(
        { error: "Only owners can manage members" },
        { status: 403 },
      );
    }
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { userId } = await params;

  const supabase = await createSupabaseServerClient();
  const membershipRes = await supabase
    .from("memberships")
    .select("id, role")
    .eq("user_id", userId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (membershipRes.error) {
    console.error("load membership failed", {
      userId: ctx.userId,
      orgId: ctx.orgId,
      targetUserId: userId,
      message: membershipRes.error.message,
    });
    return NextResponse.json({ error: "Failed to load membership" }, { status: 500 });
  }
  const membership = membershipRes.data as { id: string; role: string } | null;
  if (!membership) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const nextRole = parsed.data.role;

  if (userId === ctx.userId && membership.role === "OWNER" && nextRole !== "OWNER") {
    const ownerCount = await supabase
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("org_id", ctx.orgId)
      .eq("role", "OWNER");
    if (ownerCount.error) {
      console.error("owner count failed", { orgId: ctx.orgId, message: ownerCount.error.message });
      return NextResponse.json({ error: "Failed to validate owner count" }, { status: 500 });
    }
    if ((ownerCount.count ?? 0) === 1) {
      return NextResponse.json(
        { error: "Cannot downgrade the last owner" },
        { status: 400 },
      );
    }
  }

  if (membership.role === "OWNER" && nextRole !== "OWNER") {
    const ownerCount = await supabase
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("org_id", ctx.orgId)
      .eq("role", "OWNER");
    if (ownerCount.error) {
      console.error("owner count failed", { orgId: ctx.orgId, message: ownerCount.error.message });
      return NextResponse.json({ error: "Failed to validate owner count" }, { status: 500 });
    }
    if ((ownerCount.count ?? 0) === 1) {
      return NextResponse.json(
        { error: "Organization must have at least one owner" },
        { status: 400 },
      );
    }
  }

  const updatedRes = await supabase
    .from("memberships")
    .update({ role: nextRole })
    .eq("user_id", userId)
    .eq("org_id", ctx.orgId)
    .select("user_id, role")
    .maybeSingle();
  if (updatedRes.error) {
    console.error("update membership failed", {
      orgId: ctx.orgId,
      targetUserId: userId,
      message: updatedRes.error.message,
    });
    return NextResponse.json({ error: "Failed to update member" }, { status: 500 });
  }
  if (!updatedRes.data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    member: {
      userId: updatedRes.data.user_id as string,
      role: updatedRes.data.role as string,
    },
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  getServerEnv();

  let ctx: Awaited<ReturnType<typeof getSessionContext>>;
  try {
    ctx = await getSessionContext();
    const { role } = await requireUserRole(ctx);
    if (!canManageMembers(role)) {
      return NextResponse.json(
        { error: "Only owners can manage members" },
        { status: 403 },
      );
    }
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const { userId } = await params;

  const supabase = await createSupabaseServerClient();
  const membershipRes = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (membershipRes.error) {
    console.error("load membership failed", {
      orgId: ctx.orgId,
      targetUserId: userId,
      message: membershipRes.error.message,
    });
    return NextResponse.json({ error: "Failed to load membership" }, { status: 500 });
  }
  const membership = membershipRes.data as { role: string } | null;
  if (!membership) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (membership.role === "OWNER") {
    const ownerCount = await supabase
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("org_id", ctx.orgId)
      .eq("role", "OWNER");
    if (ownerCount.error) {
      console.error("owner count failed", { orgId: ctx.orgId, message: ownerCount.error.message });
      return NextResponse.json({ error: "Failed to validate owner count" }, { status: 500 });
    }
    if ((ownerCount.count ?? 0) === 1) {
      return NextResponse.json(
        { error: "Cannot remove the last owner" },
        { status: 400 },
      );
    }
  }

  const deleteRes = await supabase
    .from("memberships")
    .delete()
    .eq("user_id", userId)
    .eq("org_id", ctx.orgId)
    .select("id")
    .maybeSingle();
  if (deleteRes.error) {
    console.error("delete membership failed", {
      orgId: ctx.orgId,
      targetUserId: userId,
      message: deleteRes.error.message,
    });
    return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
  }

  if (userId === ctx.userId) {
    const profileRes = await supabase
      .from("profiles")
      .update({ current_org_id: null })
      .eq("id", ctx.userId)
      .eq("current_org_id", ctx.orgId)
      .select("id")
      .maybeSingle();
    if (profileRes.error) {
      console.error("clear current org failed", { userId: ctx.userId, message: profileRes.error.message });
      return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
