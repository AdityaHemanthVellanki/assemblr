import { ensureCorePluginsLoaded } from "@/lib/core/plugins/loader";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ExecutionTracer } from "@/lib/observability/tracer";
import { isToolSystemSpec } from "@/lib/toolos/spec";
import { executeToolAction } from "@/lib/toolos/runtime";
import { runWorkflow } from "@/lib/toolos/workflow-engine";
import { loadMemory, saveMemory, MemoryScope } from "@/lib/toolos/memory-store";

export class EventLoop {
  private isRunning = false;
  private interval: NodeJS.Timeout | null = null;

  start(intervalMs: number = 60000) {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log("[EventLoop] Started");
    
    // Initial Run
    this.tick();

    this.interval = setInterval(() => this.tick(), intervalMs);
  }

  stop() {
    this.isRunning = false;
    if (this.interval) clearInterval(this.interval);
    console.log("[EventLoop] Stopped");
  }

  async tick() {
    await ensureCorePluginsLoaded();
    console.log("[EventLoop] Tick");
    const supabase = createSupabaseAdminClient();
    const { data: projects, error } = await (supabase.from("projects") as any).select("id, org_id, spec, active_version_id");
    if (error || !projects) return;
    for (const project of projects) {
      let spec = project.spec;
      if (project.active_version_id) {
        const { data: version } = await (supabase.from("tool_versions") as any)
          .select("tool_spec")
          .eq("id", project.active_version_id)
          .single();
        spec = version?.tool_spec ?? spec;
      }
      if (!isToolSystemSpec(spec)) continue;
      const scope: MemoryScope = { type: "tool_org", toolId: project.id, orgId: project.org_id };
      const paused = await loadMemory({
        scope,
        namespace: "tool_builder",
        key: "automation_paused",
      });
      if (paused === true) continue;
      for (const trigger of spec.triggers) {
        if (!trigger.enabled) continue;
        if (trigger.type !== "cron") continue;
        const intervalMinutes = resolveIntervalMinutes(trigger.condition ?? {});
        const lastKey = `trigger.${trigger.id}.last_run_at`;
        const failureKey = `trigger.${trigger.id}.failure_count`;
        const failureCount = await loadMemory({
          scope,
          namespace: spec.memory.tool.namespace,
          key: failureKey,
        });
        const threshold = Number(trigger.condition?.failureThreshold ?? 0);
        if (threshold > 0 && Number(failureCount ?? 0) >= threshold) {
          await saveMemory({
            scope,
            namespace: "tool_builder",
            key: "automation_paused",
            value: true,
          });
          continue;
        }
        const lastRun = await loadMemory({
          scope,
          namespace: spec.memory.tool.namespace,
          key: lastKey,
        });
        const now = Date.now();
        const lastTs = typeof lastRun === "number" ? lastRun : 0;
        if (now - lastTs < intervalMinutes * 60000) continue;
        const ok = await this.dispatch({
          orgId: project.org_id,
          toolId: project.id,
          spec,
          trigger,
        });
        if (ok) {
          await saveMemory({
            scope,
            namespace: spec.memory.tool.namespace,
            key: failureKey,
            value: 0,
          });
        } else {
          const nextCount = Number(failureCount ?? 0) + 1;
          await saveMemory({
            scope,
            namespace: spec.memory.tool.namespace,
            key: failureKey,
            value: nextCount,
          });
          if (threshold > 0 && nextCount >= threshold) {
            await saveMemory({
              scope,
              namespace: "tool_builder",
              key: "automation_paused",
              value: true,
            });
          }
        }
        await saveMemory({
          scope,
          namespace: spec.memory.tool.namespace,
          key: lastKey,
          value: now,
        });
      }
    }
  }

  async dispatch(input: {
    orgId: string;
    toolId: string;
    spec: any;
    trigger: any;
  }): Promise<boolean> {
    const { orgId, toolId, spec, trigger } = input;
    console.log(`[EventLoop] Dispatching trigger ${trigger.id}`);
    const tracer = new ExecutionTracer("run");
    try {
      if (trigger.actionId) {
        await executeToolAction({
          orgId,
          toolId,
          spec,
          actionId: trigger.actionId,
          input: trigger.condition ?? {},
          triggerId: trigger.id,
        });
      } else if (trigger.workflowId) {
        await runWorkflow({
          orgId,
          toolId,
          spec,
          workflowId: trigger.workflowId,
          input: trigger.condition ?? {},
          triggerId: trigger.id,
        });
      }
      tracer.finish("success");
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown";
      tracer.finish("failure", msg);
      console.error(`[EventLoop] Trigger ${trigger.id} failed`, e);
      return false;
    }
  }
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

// Singleton Instance
export const globalEventLoop = new EventLoop();
