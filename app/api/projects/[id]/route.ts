import { NextResponse } from "next/server";

import { PermissionError, requireOrgMember, requireRole } from "@/lib/permissions";
import { parseToolSpec } from "@/lib/spec/toolSpec";
import { isToolSystemSpec } from "@/lib/toolos/spec";
import { getServerEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  getServerEnv();

  let ctx: Awaited<ReturnType<typeof requireOrgMember>>["ctx"];
  try {
    ({ ctx } = await requireOrgMember());
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const projectRes = await supabase
    .from("projects")
    .select("id, name, spec, created_at, updated_at")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();

  if (projectRes.error) {
    console.error("load project failed", {
      userId: ctx.userId,
      orgId: ctx.orgId,
      projectId: id,
      message: projectRes.error.message,
    });
    return NextResponse.json({ error: "Failed to load project" }, { status: 500 });
  }

  if (!projectRes.data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rawSpec = projectRes.data.spec;
  const parsed = isToolSystemSpec(rawSpec) ? { ok: true as const, spec: rawSpec } : parseToolSpec(rawSpec);

  return NextResponse.json({
    project: {
      id: projectRes.data.id as string,
      name: projectRes.data.name as string,
      createdAt: new Date(projectRes.data.created_at as string),
      updatedAt: new Date(projectRes.data.updated_at as string),
      spec: parsed.ok ? parsed.spec : null,
      spec_error: parsed.ok ? null : parsed.error,
    },
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  getServerEnv();

  let ctx: Awaited<ReturnType<typeof requireRole>>["ctx"];
  try {
    ({ ctx } = await requireRole("editor"));
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const { id } = await params;
  const json = await req.json().catch(() => null);

  if (!json || typeof json !== "object" || !("name" in json) || typeof json.name !== "string") {
    return NextResponse.json({ error: "Invalid request body: 'name' string required" }, { status: 400 });
  }

  const name = json.name.trim();
  if (!name) {
    return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
  }

  if (name.length > 80) {
    return NextResponse.json({ error: "Name too long (max 80 chars)" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("projects")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .select("id, name, updated_at")
    .single();

  if (error) {
    console.error("update project failed", {
      userId: ctx.userId,
      orgId: ctx.orgId,
      projectId: id,
      message: error.message,
    });
    return NextResponse.json({ error: "Failed to update project" }, { status: 500 });
  }

  return NextResponse.json({
    project: {
      id: data.id,
      name: data.name,
      updatedAt: data.updated_at,
    },
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  getServerEnv();

  let ctx: Awaited<ReturnType<typeof requireRole>>["ctx"];
  try {
    ({ ctx } = await requireRole("editor"));
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  
  // Use RPC for safe cascade delete
  const { error } = await supabase.rpc("delete_project_cascade", {
    p_project_id: id,
    p_org_id: ctx.orgId,
  });

  if (error) {
    console.error("delete project failed", {
      userId: ctx.userId,
      orgId: ctx.orgId,
      projectId: id,
      message: error.message,
    });
    
    // Handle specific errors
    if (error.message.includes("Permission denied")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }
    if (error.message.includes("Project not found")) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    
    return NextResponse.json({ error: "Failed to delete project" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
