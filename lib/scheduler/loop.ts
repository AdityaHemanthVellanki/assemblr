import { ensureCorePluginsLoaded } from "@/lib/core/plugins/loader";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ExecutionTracer } from "@/lib/observability/tracer";
import { isToolSystemSpec } from "@/lib/toolos/spec";
import { executeToolAction } from "@/lib/toolos/runtime";
import { runWorkflow } from "@/lib/toolos/workflow-engine";
import { loadToolMemory, saveToolMemory } from "@/lib/toolos/memory-store";

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
      for (const trigger of spec.triggers) {
        if (!trigger.enabled) continue;
        if (trigger.type !== "cron") continue;
        const intervalMinutes = Number(trigger.condition?.intervalMinutes ?? 1);
        const lastKey = `trigger.${trigger.id}.last_run_at`;
        const lastRun = await loadToolMemory({
          toolId: project.id,
          orgId: project.org_id,
          namespace: spec.memory.tool.namespace,
          key: lastKey,
        });
        const now = Date.now();
        const lastTs = typeof lastRun === "number" ? lastRun : 0;
        if (now - lastTs < intervalMinutes * 60000) continue;
        await this.dispatch({
          orgId: project.org_id,
          toolId: project.id,
          spec,
          trigger,
        });
        await saveToolMemory({
          toolId: project.id,
          orgId: project.org_id,
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
  }) {
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown";
      tracer.finish("failure", msg);
      console.error(`[EventLoop] Trigger ${trigger.id} failed`, e);
    }
  }
}

// Singleton Instance
export const globalEventLoop = new EventLoop();
