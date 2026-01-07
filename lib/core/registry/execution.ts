
import { ExecutionABI } from "../abi/types";

export class ExecutionRegistry implements ExecutionABI {
  // Simple in-memory storage for traces. In production, this would send to an observability service.
  private traces: Map<string, any[]> = new Map();

  emitTrace(traceId: string, event: any): void {
    if (!this.traces.has(traceId)) {
      this.traces.set(traceId, []);
    }
    const trace = this.traces.get(traceId);
    trace?.push({
      timestamp: new Date().toISOString(),
      ...event
    });
    // console.log(`[Trace:${traceId}]`, event);
  }

  getTrace(traceId: string): any {
    return this.traces.get(traceId) || [];
  }
}
