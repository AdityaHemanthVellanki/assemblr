import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgMember, requireProjectOrgAccess, requireRole } from "@/lib/permissions";
// import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadMemory, MemoryScope } from "@/lib/toolos/memory-store";
import { createToolVersion, promoteToolVersion } from "@/lib/toolos/versioning";
import { buildCompiledToolArtifact } from "@/lib/toolos/compiler";
import { ToolSystemSpec } from "@/lib/toolos/spec";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  triggerId: z.string().min(1),
  enabled: z.boolean().optional(),
  cron: z.string().optional(),
  intervalMinutes: z.number().optional(),
  failureThreshold: z.number().optional(),
  actionId: z.string().optional(),
  workflowId: z.string().optional(),
});

async function loadActiveSpec({ supabase, toolId, orgId }: { supabase: any, toolId: string, orgId: string }) {
    const { data: project } = await (supabase.from("projects") as any)
      .select("spec, active_version_id")
      .eq("id", toolId)
      .eq("org_id", orgId)
      .single();
    
    if (!project?.spec) return { spec: null, baseSpec: null };

    let spec = project.spec;
    if (project.active_version_id) {
       const { data: version } = await (supabase.from("tool_versions") as any)
        .select("tool_spec")
        .eq("id", project.active_version_id)
        .single();
       if (version?.tool_spec) spec = version.tool_spec;
    }
    return { spec: spec as ToolSystemSpec, baseSpec: project.spec };
}

function resolveIntervalMinutes(condition: Record<string, any>) {
    if (typeof condition.intervalMinutes === "number") return condition.intervalMinutes;
    if (condition.cron) return 0; // Can't easily calc next run for cron without parsing
    return 60;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  try {
    const { toolId } = await params;
    const { ctx } = await requireOrgMember();
    await requireProjectOrgAccess(ctx, toolId);
    // Use Admin Client for trigger/spec loading
    const supabase = createSupabaseAdminClient();
    const scope: MemoryScope = { type: "tool_org", toolId, orgId: ctx.orgId };

    const { spec } = await loadActiveSpec({ supabase, toolId, orgId: ctx.orgId });
    if (!spec) {
      return errorResponse("Tool not found", 404);
    }

    const paused = await loadMemory({
      scope,
      namespace: "tool_builder",
      key: "automation_paused",
    });

    const triggers = await Promise.all(
      (spec.triggers ?? []).map(async (trigger) => {
        const lastKey = `trigger.${trigger.id}.last_run_at`;
        const failureKey = `trigger.${trigger.id}.failure_count`;
        const lastRun = await loadMemory({
          scope,
          namespace: spec.memory.tool.namespace,
          key: lastKey,
        });
        const failures = await loadMemory({
          scope,
          namespace: spec.memory.tool.namespace,
          key: failureKey,
        });
        const intervalMinutes = resolveIntervalMinutes(trigger.condition ?? {});
        const lastTs = typeof lastRun === "number" ? lastRun : null;
        const nextRunAt = lastTs ? new Date(lastTs + intervalMinutes * 60000).toISOString() : null;
        return {
          id: trigger.id,
          name: trigger.name,
          type: trigger.type,
          enabled: trigger.enabled,
          config: trigger.condition,
          stats: {
            lastRunAt: lastTs ? new Date(lastTs).toISOString() : null,
            nextRunAt,
            failureCount: typeof failures === "number" ? failures : 0,
          },
        };
      })
    );

    return jsonResponse({ triggers, paused });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  try {
    const { toolId } = await params;
    const { ctx } = await requireRole("editor");
    await requireProjectOrgAccess(ctx, toolId);
    const json = await req.json().catch(() => ({}));
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      return errorResponse("Invalid body", 400);
    }

    // Use Admin Client for updates
    const supabase = createSupabaseAdminClient();
    const { spec, baseSpec } = await loadActiveSpec({ supabase, toolId, orgId: ctx.orgId });
    if (!spec) {
      return errorResponse("Tool not found", 404);
    }

    const updatedTriggers = spec.triggers.map((trigger) => {
      if (trigger.id !== parsed.data.triggerId) return trigger;
      const nextCondition = { ...(trigger.condition ?? {}) };
      if (parsed.data.cron) nextCondition.cron = parsed.data.cron;
      if (parsed.data.intervalMinutes) nextCondition.intervalMinutes = parsed.data.intervalMinutes;
      if (parsed.data.failureThreshold !== undefined) nextCondition.failureThreshold = parsed.data.failureThreshold;
      return {
        ...trigger,
        enabled: parsed.data.enabled ?? trigger.enabled,
        actionId: parsed.data.actionId ?? trigger.actionId,
        workflowId: parsed.data.workflowId ?? trigger.workflowId,
        condition: nextCondition,
      };
    });

    const nextSpec: ToolSystemSpec = { ...spec, triggers: updatedTriggers };
    const compiledTool = buildCompiledToolArtifact(nextSpec);
    const version = await createToolVersion({
      orgId: ctx.orgId,
      toolId,
      userId: ctx.userId,
      spec: nextSpec,
      compiledTool,
      baseSpec: baseSpec ?? spec,
    });
    await promoteToolVersion({ toolId, versionId: version.id });

    return jsonResponse({ status: "ok" });
  } catch (e) {
    return handleApiError(e);
  }
}
