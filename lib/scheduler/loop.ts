import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Trigger } from "@/lib/core/triggers";
import { executeToolAction } from "@/app/actions/execute-action"; // Reuse existing runner
import { ExecutionTracer } from "@/lib/observability/tracer";
import { randomUUID } from "crypto";
import { ensureCorePluginsLoaded } from "@/lib/core/plugins/loader";

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
    const supabase = await createSupabaseServerClient();

    // 1. Poll Due Triggers (Cron)
    // In a real system, we'd have a DB query for `next_run_at <= now`
    // Since we don't have the table yet, we'll mock the fetch or assume "triggers" table exists
    // We will assume "triggers" table exists for this implementation
    
    try {
        const now = new Date().toISOString();
        const { data: triggers, error } = await (supabase.from("triggers") as any)
            .select("*")
            .eq("enabled", true)
            .lte("next_run_at", now);

        if (error) {
            // Table might not exist yet
            return;
        }

        if (triggers && triggers.length > 0) {
            console.log(`[EventLoop] Found ${triggers.length} due triggers`);
            for (const trigger of triggers) {
                await this.dispatch(trigger);
            }
        }
    } catch (e) {
        console.error("[EventLoop] Tick failed", e);
    }
  }

  async dispatch(trigger: Trigger) {
      console.log(`[EventLoop] Dispatching trigger ${trigger.id}`);
      const tracer = new ExecutionTracer("run");
      
      try {
          // 1. Update Next Run (Optimistic Locking)
          // Calculate next run based on cron
          // Mocking next run as +1 minute for now
          const nextRun = new Date(Date.now() + 60000).toISOString();
          // await supabase.from("triggers").update({ next_run_at: nextRun }).eq("id", trigger.id);

          // 2. Resolve Intent / Action
          // A trigger usually maps to an "action" in the tool spec or a specific intent.
          // For simplicity, let's assume the trigger metadata points to an actionId
          // Or we compile a "System Intent"
          
          // Let's assume we execute a "main" action or derived action
          // Mocking: Execute "action_main" if exists, or just log
          
          tracer.logActionExecution({
              actionId: "trigger_dispatch",
              type: "system",
              inputs: { triggerId: trigger.id },
              status: "success"
          });
          
          // Execute Logic Here (Reuse executeToolAction if mapped)
          // await executeToolAction(trigger.tool_id, "some_action", {}, trigger.bound_version_id);
          
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
