import { NextResponse } from "next/server";

import { PermissionError, requireOrgMember } from "@/lib/permissions";
import { getServerEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  getServerEnv();
  try {
    const { ctx } = await requireOrgMember();
    const supabase = await createSupabaseServerClient();
    const { data, error } = await (supabase.from("profiles") as any)
      .select("name, avatar_url")
      .eq("id", ctx.userId)
      .single();
    if (error) {
      return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
    }
    return NextResponse.json({ name: data?.name ?? "", avatar_url: data?.avatar_url ?? null });
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function PATCH(req: Request) {
  getServerEnv();
  try {
    const { ctx } = await requireOrgMember();
    const body = (await req.json().catch(() => null)) as
      | { name?: string; avatar_url?: string | null }
      | null;
    const name = body?.name ?? null;
    const avatarUrl = body?.avatar_url ?? null;
    const supabase = await createSupabaseServerClient();
    const { error } = await (supabase.from("profiles") as any)
      .update({ name, avatar_url: avatarUrl })
      .eq("id", ctx.userId);
    if (error) {
      return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
