import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "crypto";

import { requireOrgMember, requireProjectOrgAccess, requireRole } from "@/lib/auth/permissions.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadToolMemory } from "@/lib/toolos/memory-store";
import { createToolVersion, promoteToolVersion } from "@/lib/toolos/versioning";
import { ToolSystemSpec } from "@/lib/toolos/spec";

const patchSchema = z.object({
  triggerId: z.string().min(1),
  enabled: z.boolean().optional(),
  cron: z.string().optional(),
  intervalMinutes: z.number().optional(),
  failureThreshold: z.number().optional(),
  actionId: z.string().optional(),
  workflowId: z.string().optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  const { toolId } = await params;
  const { ctx } = await requireOrgMember();
  await requireProjectOrgAccess(ctx, toolId);
  const supabase = await createSupabaseServerClient();

  const { spec } = await loadActiveSpec({ supabase, toolId, orgId: ctx.orgId });
  if (!spec) {
    return NextResponse.json({ error: "Tool not found" }, { status: 404 });
  }

  const paused = await loadToolMemory({
    toolId,
    orgId: ctx.orgId,
    namespace: "tool_builder",
    key: "automation_paused",
  });

  const triggers = await Promise.all(
    (spec.triggers ?? []).map(async (trigger) => {
      const lastKey = `trigger.${trigger.id}.last_run_at`;
      const failureKey = `trigger.${trigger.id}.failure_count`;
      const lastRun = await loadToolMemory({
        toolId,
        orgId: ctx.orgId,
        namespace: spec.memory.tool.namespace,
        key: lastKey,
      });
      const failures = await loadToolMemory({
        toolId,
        orgId: ctx.orgId,
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
        actionId: trigger.actionId ?? null,
        workflowId: trigger.workflowId ?? null,
        condition: trigger.condition ?? {},
        last_run_at: lastTs ? new Date(lastTs).toISOString() : null,
        next_run_at: nextRunAt,
        failure_count: Number(failures ?? 0),
      };
    }),
  );

  return NextResponse.json({
    paused: paused === true,
    triggers,
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  const { toolId } = await params;
  const { ctx } = await requireRole("editor");
  await requireProjectOrgAccess(ctx, toolId);
  const json = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { spec, baseSpec } = await loadActiveSpec({ supabase, toolId, orgId: ctx.orgId });
  if (!spec) {
    return NextResponse.json({ error: "Tool not found" }, { status: 404 });
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
  const compiledTool = {
    compiledAt: new Date().toISOString(),
    specHash: createHash("sha256").update(JSON.stringify(nextSpec)).digest("hex"),
  };
  const version = await createToolVersion({
    orgId: ctx.orgId,
    toolId,
    userId: ctx.userId,
    spec: nextSpec,
    compiledTool,
    baseSpec: baseSpec ?? spec,
  });
  await promoteToolVersion({ toolId, versionId: version.id });

  return NextResponse.json({ status: "ok" });
}

async function loadActiveSpec(params: {
  supabase: ReturnType<typeof createSupabaseServerClient> | any;
  toolId: string;
  orgId: string;
}): Promise<{ spec: ToolSystemSpec | null; baseSpec: ToolSystemSpec | null }> {
  const { supabase, toolId, orgId } = params;
  const { data: project } = await (supabase.from("projects") as any)
    .select("spec, active_version_id")
    .eq("id", toolId)
    .eq("org_id", orgId)
    .single();
  if (!project?.spec) return { spec: null, baseSpec: null };
  let spec = project.spec as ToolSystemSpec;
  let baseSpec = spec;
  if (project.active_version_id) {
    const { data: version } = await (supabase.from("tool_versions") as any)
      .select("tool_spec")
      .eq("id", project.active_version_id)
      .single();
    if (version?.tool_spec) {
      spec = version.tool_spec as ToolSystemSpec;
      baseSpec = spec;
    }
  }
  return { spec, baseSpec };
}

function resolveIntervalMinutes(condition: Record<string, any>) {
  const cron = String(condition.cron ?? condition.cron_expression ?? "").trim();
  const cronMinutes = parseCronInterval(cron);
  if (cronMinutes) return cronMinutes;
  const interval = Number(condition.intervalMinutes ?? 1);
  return Number.isFinite(interval) && interval > 0 ? interval : 1;
}

function parseCronInterval(cron: string) {
  if (!cron) return null;
  const parts = cron.split(" ").filter(Boolean);
  if (parts.length < 5) return null;
  const minutePart = parts[0];
  const hourPart = parts[1];
  const minuteMatch = minutePart.match(/^\*\/(\d+)$/);
  if (minuteMatch) {
    return Number(minuteMatch[1]) || null;
  }
  const hourMatch = hourPart.match(/^\*\/(\d+)$/);
  if (minutePart === "0" && hourMatch) {
    return (Number(hourMatch[1]) || 0) * 60;
  }
  return null;
}
