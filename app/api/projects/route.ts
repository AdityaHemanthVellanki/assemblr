import { NextResponse } from "next/server";

import { canEditProjects, getSessionContext, PermissionError, requireUserRole } from "@/lib/auth/permissions";
import { getServerEnv } from "@/lib/env";
import { createDefaultDashboardSpec } from "@/lib/dashboard/spec";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  getServerEnv();

  try {
    const ctx = await getSessionContext();
    await requireUserRole(ctx);

    const supabase = await createSupabaseServerClient();
    const projectsRes = await supabase
      .from("projects")
      .select("id, name, created_at, updated_at")
      .eq("org_id", ctx.orgId)
      .order("updated_at", { ascending: false });

    if (projectsRes.error) {
      console.error("list projects failed", {
        userId: ctx.userId,
        orgId: ctx.orgId,
        message: projectsRes.error.message,
      });
      return NextResponse.json({ error: "Failed to load projects" }, { status: 500 });
    }

    const projects = (projectsRes.data ?? []).map((p) => ({
      id: p.id as string,
      name: p.name as string,
      createdAt: new Date(p.created_at as string),
      updatedAt: new Date(p.updated_at as string),
    }));

    return NextResponse.json({ projects });
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function POST(req: Request) {
  getServerEnv();

  try {
    const ctx = await getSessionContext();
    const { role } = await requireUserRole(ctx);
    if (!canEditProjects(role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as unknown;
    const maybeName =
      body && typeof body === "object" && "name" in body
        ? (body as { name?: unknown }).name
        : undefined;
    const name =
      typeof maybeName === "string" && maybeName.trim().length > 0
        ? maybeName.trim()
        : "Untitled Project";

    const spec = createDefaultDashboardSpec({ title: name });

    const supabase = await createSupabaseServerClient();
    const projectRes = await supabase
      .from("projects")
      .insert({ name, org_id: ctx.orgId, spec })
      .select("id")
      .single();
    if (projectRes.error || !projectRes.data?.id) {
      console.error("create project failed", {
        userId: ctx.userId,
        orgId: ctx.orgId,
        message: projectRes.error?.message,
      });
      return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
    }

    return NextResponse.json({ id: projectRes.data.id }, { status: 201 });
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
