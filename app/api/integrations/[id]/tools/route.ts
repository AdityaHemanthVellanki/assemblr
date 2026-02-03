import { NextResponse } from "next/server";

import { PermissionError, requireOrgMember } from "@/lib/permissions";
import { getServerEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ToolUsageItem = {
  id: string;
  name: string;
  status: "READY" | "BLOCKED" | "DEGRADED";
  lastExecutionAt: string | null;
  updatedAt: string;
};

function extractIntegrationIds(spec: unknown): string[] {
  if (!spec || typeof spec !== "object") return [];
  const s = spec as any;
  const ids = new Set<string>();
  const integrations = Array.isArray(s.integrations) ? s.integrations : [];
  for (const integration of integrations) {
    if (integration && typeof integration.id === "string") ids.add(integration.id);
  }
  const actions = Array.isArray(s.actions) ? s.actions : [];
  for (const action of actions) {
    if (action && typeof action.integrationId === "string") ids.add(action.integrationId);
  }
  return Array.from(ids);
}

function mapProjectStatus(status: string | null | undefined): ToolUsageItem["status"] {
  if (status === "READY") return "READY";
  if (status === "FAILED" || status === "CORRUPTED") return "DEGRADED";
  return "BLOCKED";
}

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

  const { id: integrationId } = await params;
  if (!integrationId?.trim()) {
    return NextResponse.json({ error: "Invalid integration" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, name, spec, status, updated_at")
    .eq("org_id", ctx.orgId);

  if (error) {
    console.error("list integration tools failed", {
      orgId: ctx.orgId,
      integrationId,
      message: error.message,
    });
    return NextResponse.json({ error: "Failed to load tools" }, { status: 500 });
  }

  const relevant = (projects ?? []).filter((project) => {
    const ids = extractIntegrationIds(project.spec);
    return ids.includes(integrationId);
  });

  const toolIds = relevant.map((p) => p.id);
  const lastRunByTool = new Map<string, string>();

  if (toolIds.length > 0) {
    const { data: runs, error: runsError } = await supabase
      .from("prompt_executions")
      .select("tool_id, created_at")
      .eq("org_id", ctx.orgId)
      .in("tool_id", toolIds)
      .order("created_at", { ascending: false });

    if (!runsError && runs) {
      for (const run of runs) {
        if (!lastRunByTool.has(run.tool_id as string)) {
          lastRunByTool.set(run.tool_id as string, run.created_at as string);
        }
      }
    }
  }

  const tools: ToolUsageItem[] = relevant.map((project) => ({
    id: project.id,
    name: project.name,
    status: mapProjectStatus(project.status as string),
    lastExecutionAt: lastRunByTool.get(project.id) ?? null,
    updatedAt: project.updated_at as string,
  }));

  return NextResponse.json({ tools });
}
