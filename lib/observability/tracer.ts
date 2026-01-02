import { createTrace, updateTrace } from "./store";

export type TraceContext = {
  orgId: string;
  source: string;
  triggerRef?: string;
  dependencies?: string[];
  metadata?: any;
};

export async function withTrace<T>(
  ctx: TraceContext,
  traceType: "metric" | "alert" | "workflow",
  inputs: any,
  fn: (traceId: string) => Promise<T>
): Promise<T> {
  // 1. Start Trace
  const trace = await createTrace({
    orgId: ctx.orgId,
    traceType,
    source: ctx.source,
    triggerRef: ctx.triggerRef,
    inputs,
    outputs: {},
    dependencies: ctx.dependencies || [],
    metadata: ctx.metadata || {},
  });

  try {
    // 2. Execute
    await updateTrace(trace.id, { status: "running" });
    const result = await fn(trace.id);

    // 3. Success
    await updateTrace(trace.id, { 
      status: "completed", 
      outputs: typeof result === "object" ? result : { value: result } 
    });
    
    return result;
  } catch (err) {
    // 4. Failure
    await updateTrace(trace.id, { 
      status: "failed", 
      error: err instanceof Error ? err.message : String(err) 
    });
    throw err;
  }
}
