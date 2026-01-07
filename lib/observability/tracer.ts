import { randomUUID } from "crypto";
import { ExecutionTrace, IntegrationAccess, ActionExecution, AgentExecution, StateMutation, UIMutation } from "@/lib/core/trace";
import { CompiledIntent } from "@/lib/core/intent";

export class ExecutionTracer {
  private trace: ExecutionTrace;

  constructor(mode: "create" | "modify" | "run") {
    this.trace = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      mode,
      agents_invoked: [],
      integrations_accessed: [],
      actions_executed: [],
      state_mutations: [],
      ui_mutations: [],
      outcome: "failure", // Default to failure until explicit success
    };
  }

  setIntent(intent: CompiledIntent) {
    this.trace.compiled_intent = intent;
  }

  logAgentExecution(exec: AgentExecution) {
    this.trace.agents_invoked.push(exec);
  }

  logIntegrationAccess(access: IntegrationAccess) {
    this.trace.integrations_accessed.push(access);
  }

  logActionExecution(exec: ActionExecution) {
    this.trace.actions_executed.push(exec);
  }
  
  logStateMutation(mut: StateMutation) {
      this.trace.state_mutations.push(mut);
  }
  
  logUIMutation(mut: UIMutation) {
      this.trace.ui_mutations.push(mut);
  }

  finish(outcome: "success" | "failure", reason?: string) {
    this.trace.outcome = outcome;
    if (reason) this.trace.failure_reason = reason;
    
    // Persist (Mock for now, logging to stdout)
    console.log(`[ExecutionTrace] ${JSON.stringify(this.trace, null, 2)}`);
    
    return this.trace;
  }

  getTrace() {
    return this.trace;
  }

  generateExplanation(): string {
      const parts: string[] = [];
      
      // Integrations
      if (this.trace.integrations_accessed.length > 0) {
          const sources = [...new Set(this.trace.integrations_accessed.map(i => i.integrationId))];
          parts.push(`I accessed ${sources.join(", ")}.`);
      }

      // UI Mutations
      const added = this.trace.ui_mutations.filter(m => m.changeType === "added");
      if (added.length > 0) {
          parts.push(`I created ${added.length} new UI components.`);
      }

      // State Mutations
      if (this.trace.state_mutations.length > 0) {
          parts.push(`I updated ${this.trace.state_mutations.length} state variables.`);
      }

      // Failure
      if (this.trace.outcome === "failure") {
          return `I failed to complete the request. Reason: ${this.trace.failure_reason}`;
      }

      if (parts.length === 0) return "I processed your request.";
      return parts.join(" ");
  }
}

// Helper for backward compatibility and simple tracing
export async function withTrace<T>(
  meta: any,
  type: string,
  inputs: any,
  fn: (traceId: string) => Promise<T>
): Promise<T> {
  // Use "run" mode as default for background tasks
  const tracer = new ExecutionTracer("run");
  
  // Log inputs if possible
  if (inputs) {
      tracer.logActionExecution({
          actionId: "start",
          type: type,
          inputs: inputs,
          status: "success"
      });
  }

  try {
    const result = await fn(tracer.getTrace().id);
    tracer.finish("success");
    return result;
  } catch (e) {
    tracer.finish("failure", e instanceof Error ? e.message : "Unknown error");
    throw e;
  }
}
