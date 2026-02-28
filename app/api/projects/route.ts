import { NextResponse } from "next/server";

import { PermissionError, requireOrgMember, requireRole } from "@/lib/permissions";
import { getServerEnv } from "@/lib/env";
import { hasMinimalToolSpecFields, parseToolSpec } from "@/lib/spec/toolSpec";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ensureToolIdentity, ensureProjectIdentity } from "@/lib/toolos/lifecycle";

export const dynamic = "force-dynamic";

export async function GET() {
  getServerEnv();

  try {
    const { ctx } = await requireOrgMember();

    const supabase = await createSupabaseServerClient();
    // Only fetch lightweight columns — NOT spec (100KB+ JSONB per row)
    const projectsRes = await supabase
      .from("projects")
      .select("id, name, status, created_at, updated_at")
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

    if (!projectsRes.data) {
      throw new Error("Failed to load projects");
    }

    const projects = projectsRes.data.map((p) => {
      // Infer validity from status instead of parsing full spec
      const validStatuses = ["MATERIALIZED", "READY", "READY_TO_EXECUTE", "EXECUTING", "PLANNED"];
      return {
        id: p.id as string,
        name: p.name as string,
        createdAt: new Date(p.created_at as string),
        updatedAt: new Date(p.updated_at as string),
        isValidSpec: validStatuses.includes(p.status as string) || p.status === "CREATED",
        specError: null,
      };
    });

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
    const { ctx } = await requireRole("editor");

    const body = (await req.json().catch(() => null)) as unknown;
    const maybeName =
      body && typeof body === "object" && "name" in body
        ? (body as { name?: unknown }).name
        : body && typeof body === "object" && "prompt" in body
          ? (body as { prompt?: unknown }).prompt
          : undefined;
    const name =
      typeof maybeName === "string" && maybeName.trim().length > 0
        ? maybeName.trim()
        : "Untitled Project";

    const adminSupabase = createSupabaseAdminClient();

    // Only create a tool identity if a specific name/prompt was provided.
    // "Untitled Project" is the default for a "New Chat" click without a prompt.
    if (!maybeName || name === "Untitled Project") {
      const { projectId } = await ensureProjectIdentity({
        supabase: adminSupabase,
        orgId: ctx.orgId,
        userId: ctx.userId,
        name,
      });
      return NextResponse.json({ id: projectId }, { status: 201 });
    }

    const { toolId } = await ensureToolIdentity({
      supabase: adminSupabase,
      orgId: ctx.orgId,
      userId: ctx.userId,
      name,
      purpose: name,
      sourcePrompt: name,
    });

    return NextResponse.json({ id: toolId }, { status: 201 });
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
