"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Play, CheckCircle, XCircle, Clock, GitBranch, Zap, Pause, ArrowRight } from "lucide-react";
import type { WorkflowSpec, WorkflowNode } from "@/lib/toolos/spec";

interface WorkflowViewProps {
  workflows: WorkflowSpec[];
  toolId: string;
}

type NodeStatus = "pending" | "running" | "completed" | "failed" | "skipped" | "blocked";

interface StepData {
  nodeId: string;
  status: NodeStatus;
  output?: any;
  error?: string | null;
  durationMs?: number | null;
  retries?: number;
}

export function WorkflowView({ workflows, toolId }: WorkflowViewProps) {
  const [selectedWorkflow, setSelectedWorkflow] = React.useState<string | null>(
    workflows.length > 0 ? workflows[0].id : null,
  );
  const [stepData, setStepData] = React.useState<StepData[]>([]);
  const [selectedNode, setSelectedNode] = React.useState<string | null>(null);

  const workflow = workflows.find((w) => w.id === selectedWorkflow);

  if (!workflow) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm p-8">
        <GitBranch className="w-12 h-12 mb-4 opacity-20" />
        <p>No workflows defined for this tool.</p>
        <p className="text-xs mt-1 opacity-60">Workflows are generated when your tool involves multi-step actions.</p>
      </div>
    );
  }

  const nodeStatusMap = new Map(stepData.map((s) => [s.nodeId, s]));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Workflow Selector */}
      {workflows.length > 1 && (
        <div className="flex items-center gap-2 px-6 py-3 border-b border-white/10">
          {workflows.map((wf) => (
            <button
              key={wf.id}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                selectedWorkflow === wf.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
              onClick={() => setSelectedWorkflow(wf.id)}
              type="button"
            >
              {wf.name}
            </button>
          ))}
        </div>
      )}

      {/* DAG Visualization */}
      <div className="flex-1 overflow-auto p-6">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-white">{workflow.name}</h3>
          <p className="text-xs text-muted-foreground mt-1">{workflow.description}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span>Retry: {workflow.retryPolicy.maxRetries}x</span>
            <span>Backoff: {workflow.retryPolicy.backoffMs}ms</span>
            <span>Timeout: {(workflow.timeoutMs / 1000).toFixed(0)}s</span>
          </div>
        </div>

        {/* Node List */}
        <div className="space-y-2">
          {workflow.nodes.map((node, idx) => {
            const step = nodeStatusMap.get(node.id);
            const isSelected = selectedNode === node.id;
            return (
              <React.Fragment key={node.id}>
                {idx > 0 && (
                  <div className="flex justify-center py-1">
                    <ArrowRight className="w-3.5 h-3.5 text-white/20 rotate-90" />
                  </div>
                )}
                <motion.button
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  onClick={() => setSelectedNode(isSelected ? null : node.id)}
                  className={`w-full rounded-xl border p-4 text-left transition-all ${
                    isSelected
                      ? "border-primary/40 bg-primary/5"
                      : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/5"
                  }`}
                  type="button"
                >
                  <div className="flex items-center gap-3">
                    <NodeIcon type={node.type} status={step?.status} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{node.id}</p>
                      <p className="text-xs text-muted-foreground">
                        {node.type === "action" ? `Action: ${node.actionId}` : node.type}
                        {node.type === "wait" && node.waitMs ? ` (${node.waitMs}ms)` : ""}
                        {node.type === "condition" ? `: ${node.condition}` : ""}
                      </p>
                    </div>
                    {step?.durationMs != null && (
                      <span className="text-[10px] text-muted-foreground">{step.durationMs}ms</span>
                    )}
                    {step?.retries && step.retries > 0 && (
                      <span className="text-[10px] text-amber-400">{step.retries} retries</span>
                    )}
                  </div>

                  {/* Expanded Detail */}
                  {isSelected && step && (
                    <div className="mt-3 pt-3 border-t border-white/10">
                      {step.error && (
                        <p className="text-xs text-red-400 mb-2">{step.error}</p>
                      )}
                      {step.output && (
                        <pre className="text-[10px] text-muted-foreground bg-black/30 rounded p-2 overflow-auto max-h-32">
                          {JSON.stringify(step.output, null, 2).slice(0, 500)}
                        </pre>
                      )}
                    </div>
                  )}
                </motion.button>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function NodeIcon({ type, status }: { type: string; status?: NodeStatus }) {
  const baseClass = "w-8 h-8 rounded-lg flex items-center justify-center";

  if (status === "completed") {
    return (
      <div className={`${baseClass} bg-emerald-500/10 border border-emerald-500/20`}>
        <CheckCircle className="w-4 h-4 text-emerald-400" />
      </div>
    );
  }
  if (status === "failed") {
    return (
      <div className={`${baseClass} bg-red-500/10 border border-red-500/20`}>
        <XCircle className="w-4 h-4 text-red-400" />
      </div>
    );
  }
  if (status === "running") {
    return (
      <div className={`${baseClass} bg-blue-500/10 border border-blue-500/20 animate-pulse`}>
        <Play className="w-4 h-4 text-blue-400" />
      </div>
    );
  }
  if (status === "blocked") {
    return (
      <div className={`${baseClass} bg-amber-500/10 border border-amber-500/20`}>
        <Pause className="w-4 h-4 text-amber-400" />
      </div>
    );
  }

  // Type-based icons
  if (type === "action") {
    return (
      <div className={`${baseClass} bg-blue-500/10 border border-blue-500/20`}>
        <Zap className="w-4 h-4 text-blue-400" />
      </div>
    );
  }
  if (type === "condition") {
    return (
      <div className={`${baseClass} bg-amber-500/10 border border-amber-500/20`}>
        <GitBranch className="w-4 h-4 text-amber-400" />
      </div>
    );
  }
  if (type === "wait") {
    return (
      <div className={`${baseClass} bg-neutral-500/10 border border-neutral-500/20`}>
        <Clock className="w-4 h-4 text-neutral-400" />
      </div>
    );
  }

  return (
    <div className={`${baseClass} bg-white/5 border border-white/10`}>
      <Zap className="w-4 h-4 text-muted-foreground" />
    </div>
  );
}
