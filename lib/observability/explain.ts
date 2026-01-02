import "server-only";

import { getTrace } from "./store";
import { getMetric } from "@/lib/metrics/store";

export async function generateExplanation(traceId: string): Promise<string> {
  const trace = await getTrace(traceId);
  if (!trace) return "Execution trace not found.";

  let explanation = `This ${trace.traceType} execution ${trace.status === "completed" ? "completed successfully" : "failed"} at ${trace.startedAt}.\n`;

  // 1. Inputs
  if (trace.traceType === "metric") {
    const metricName = trace.metadata?.metricName || "Unknown Metric";
    explanation += `It calculated the metric "${metricName}".\n`;
  } else if (trace.traceType === "alert") {
    const { comparison, threshold, metricName } = trace.metadata || {};
    explanation += `It evaluated the alert for "${metricName}" (Condition: ${comparison} ${threshold}).\n`;
    explanation += `The measured value was ${trace.inputs?.value}.\n`;
    if (trace.outputs?.triggered) {
      explanation += `The alert TRIGGERED because the condition was met.\n`;
    } else {
      explanation += `The alert did NOT trigger.\n`;
    }
  } else if (trace.traceType === "workflow") {
    const { workflowName } = trace.metadata || {};
    explanation += `It ran the workflow "${workflowName}".\n`;
  }

  // 2. Dependencies (Why did it run?)
  if (trace.dependencies && trace.dependencies.length > 0) {
    explanation += `\nIt was triggered by:\n`;
    for (const depId of trace.dependencies) {
      const parent = await getTrace(depId);
      if (parent) {
        if (parent.traceType === "metric") {
          explanation += `- Metric execution for "${parent.metadata?.metricName}"\n`;
        } else if (parent.traceType === "alert") {
          explanation += `- Alert trigger for "${parent.metadata?.metricName}"\n`;
        } else {
          explanation += `- Upstream ${parent.traceType} execution\n`;
        }
      }
    }
  } else {
    explanation += `\nTrigger source: ${trace.source}\n`;
  }

  // 3. Failure Analysis
  if (trace.status === "failed") {
    explanation += `\nFAILURE REASON:\n${trace.error}\n`;
    explanation += `Please check permissions or integration connectivity.`;
  }

  return explanation;
}
