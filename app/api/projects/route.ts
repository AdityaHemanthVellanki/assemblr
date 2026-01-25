import { NextResponse } from "next/server";

import { PermissionError, requireOrgMember, requireRole } from "@/lib/permissions";
import { getServerEnv } from "@/lib/env";
import { createEmptyToolSpec, hasMinimalToolSpecFields, parseToolSpec } from "@/lib/spec/toolSpec";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  getServerEnv();

  try {
    const { ctx } = await requireOrgMember();

    const supabase = await createSupabaseServerClient();
    const projectsRes = await supabase
      .from("projects")
      .select("id, name, spec, created_at, updated_at")
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
      const specResult = parseToolSpec(p.spec);
      return {
        id: p.id as string,
        name: p.name as string,
        createdAt: new Date(p.created_at as string),
        updatedAt: new Date(p.updated_at as string),
        isValidSpec: specResult.ok && hasMinimalToolSpecFields(specResult.spec),
        specError: specResult.ok ? null : specResult.error,
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
        : undefined;
    const name =
      typeof maybeName === "string" && maybeName.trim().length > 0
        ? maybeName.trim()
        : "Untitled Project";

    const spec = createEmptyToolSpec({ name, purpose: name, sourcePrompt: name });

    const supabase = await createSupabaseServerClient();
    const projectRes = await supabase
      .from("projects")
      .insert({ 
        name, 
        org_id: ctx.orgId, 
        spec,
        status: "DRAFT" // Explicitly set valid status to satisfy projects_status_check
      })
      .select("id")
      .single();

    if (projectRes.error || !projectRes.data?.id) {
      console.error("create project failed", {
        userId: ctx.userId,
        orgId: ctx.orgId,
        message: projectRes.error?.message,
        code: projectRes.error?.code,
        details: projectRes.error?.details,
      });

      // Handle constraint violations explicitly
      if (projectRes.error?.code === '23514') {
        return NextResponse.json({ 
          error: "Database constraint violation: Invalid status or data format." 
        }, { status: 400 });
      }

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
