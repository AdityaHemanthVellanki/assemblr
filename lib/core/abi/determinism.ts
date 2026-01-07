
import { CapabilityDefinition } from "./types";
import { ExecutionContext, MiddlewareNext } from "./middleware";
import { createHash } from "crypto";

export type ReplayMode = "record" | "replay" | "none";

export interface DeterminismContext extends ExecutionContext {
  replayMode?: ReplayMode;
  traceId?: string;
  executionHash?: string;
}

// In-memory trace store for demonstration. Real impl would use DB.
const TRACE_STORE = new Map<string, any[]>();

export async function enforceDeterminism(
  capability: CapabilityDefinition,
  params: any,
  context: DeterminismContext,
  next: MiddlewareNext
): Promise<any> {
  if (!context.replayMode || context.replayMode === "none") {
    return next();
  }

  const stepHash = createHash("sha256")
    .update(JSON.stringify({
        cap: capability.id,
        params,
        // Include previous hash if we were chaining, for strict causal linking
    }))
    .digest("hex");

  if (context.replayMode === "record") {
    const result = await next();
    const traceId = context.traceId || "default";
    
    if (!TRACE_STORE.has(traceId)) {
        TRACE_STORE.set(traceId, []);
    }
    
    TRACE_STORE.get(traceId)?.push({
        stepHash,
        input: params,
        output: result,
        timestamp: Date.now()
    });
    
    return result;
  }

  if (context.replayMode === "replay") {
    const traceId = context.traceId;
    if (!traceId) throw new Error("Trace ID required for replay");
    
    const trace = TRACE_STORE.get(traceId);
    if (!trace) throw new Error(`Trace ${traceId} not found`);

    // Find matching step (Simplistic: strictly sequential)
    // In a real system, we'd track an index in the context
    const stepIndex = context.stepIndex || 0;
    const recordedStep = trace[stepIndex];

    if (!recordedStep) {
        throw new Error(`Replay divergence: No recorded step at index ${stepIndex}`);
    }

    if (recordedStep.stepHash !== stepHash) {
         console.warn(`[Replay Warning] Step hash mismatch. Inputs may have changed.`);
         // Strict determinism would fail here. Loose might continue.
    }

    // Return cached result WITHOUT executing side effects
    console.log(`[Replay] Skipping execution for ${capability.id}, returning recorded result.`);
    
    // Update index for next step
    context.stepIndex = stepIndex + 1;
    
    return recordedStep.output;
  }

  return next();
}
