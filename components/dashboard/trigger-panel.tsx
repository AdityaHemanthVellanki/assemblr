"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Clock, Webhook, Zap, Play, Copy, Check, ToggleLeft, ToggleRight } from "lucide-react";
import { safeFetch } from "@/lib/api/client";

interface TriggerData {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  config: Record<string, any>;
  webhookUrl: string | null;
  stats: {
    lastRunAt: string | null;
    nextRunAt: string | null;
    failureCount: number;
  };
}

interface TriggerPanelProps {
  toolId: string;
}

export function TriggerPanel({ toolId }: TriggerPanelProps) {
  const [triggers, setTriggers] = React.useState<TriggerData[]>([]);
  const [paused, setPaused] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [copiedUrl, setCopiedUrl] = React.useState<string | null>(null);

  const fetchTriggers = React.useCallback(async () => {
    try {
      const data = await safeFetch<{ triggers: TriggerData[]; paused: boolean }>(
        `/api/tools/${toolId}/triggers`,
      );
      setTriggers(data.triggers ?? []);
      setPaused(data.paused ?? false);
    } catch {
      setTriggers([]);
    } finally {
      setIsLoading(false);
    }
  }, [toolId]);

  React.useEffect(() => {
    void fetchTriggers();
  }, [fetchTriggers]);

  const toggleTrigger = async (triggerId: string, enabled: boolean) => {
    try {
      await safeFetch(`/api/tools/${toolId}/triggers`, {
        method: "PATCH",
        body: JSON.stringify({ triggerId, enabled }),
      });
      setTriggers((prev) =>
        prev.map((t) => (t.id === triggerId ? { ...t, enabled } : t)),
      );
    } catch (err) {
      console.error("Toggle failed:", err);
    }
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        <Clock className="w-4 h-4 mr-2 animate-spin" />
        Loading triggers...
      </div>
    );
  }

  if (triggers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm p-8">
        <Zap className="w-12 h-12 mb-4 opacity-20" />
        <p>No triggers configured.</p>
        <p className="text-xs mt-1 opacity-60">Triggers are generated when your prompt implies automation (cron, webhooks, events).</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/10">
        <h3 className="text-sm font-semibold text-white">Triggers</h3>
        {paused && (
          <span className="text-[10px] px-2 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
            Automation Paused
          </span>
        )}
      </div>

      {/* Trigger List */}
      <div className="flex-1 overflow-auto p-6 space-y-3">
        {triggers.map((trigger, idx) => (
          <motion.div
            key={trigger.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="rounded-xl border border-white/10 bg-white/[0.02] p-4"
          >
            <div className="flex items-center gap-3 mb-3">
              <TriggerTypeIcon type={trigger.type} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{trigger.name}</p>
                <p className="text-xs text-muted-foreground">{trigger.type}</p>
              </div>
              <button
                onClick={() => toggleTrigger(trigger.id, !trigger.enabled)}
                className="transition-colors"
                type="button"
              >
                {trigger.enabled ? (
                  <ToggleRight className="w-6 h-6 text-emerald-400" />
                ) : (
                  <ToggleLeft className="w-6 h-6 text-muted-foreground" />
                )}
              </button>
            </div>

            {/* Config */}
            {trigger.config && Object.keys(trigger.config).length > 0 && (
              <div className="mb-3 text-[10px] text-muted-foreground bg-black/20 rounded-lg p-2">
                {Object.entries(trigger.config).map(([key, val]) => (
                  <div key={key}>
                    <span className="text-white/50">{key}:</span> {String(val)}
                  </div>
                ))}
              </div>
            )}

            {/* Webhook URL */}
            {trigger.webhookUrl && (
              <div className="mb-3">
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={trigger.webhookUrl}
                    className="flex-1 text-[10px] bg-black/30 border border-white/10 rounded px-2 py-1.5 text-muted-foreground font-mono"
                  />
                  <button
                    onClick={() => copyUrl(trigger.webhookUrl!)}
                    className="h-7 w-7 rounded flex items-center justify-center bg-white/5 hover:bg-white/10 transition-colors"
                    type="button"
                  >
                    {copiedUrl === trigger.webhookUrl ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3 text-muted-foreground" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Stats */}
            <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
              <span>Last: {trigger.stats.lastRunAt ? new Date(trigger.stats.lastRunAt).toLocaleString() : "Never"}</span>
              {trigger.stats.nextRunAt && (
                <span>Next: {new Date(trigger.stats.nextRunAt).toLocaleString()}</span>
              )}
              {trigger.stats.failureCount > 0 && (
                <span className="text-red-400">{trigger.stats.failureCount} failures</span>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function TriggerTypeIcon({ type }: { type: string }) {
  const baseClass = "w-8 h-8 rounded-lg flex items-center justify-center";
  if (type === "cron") {
    return (
      <div className={`${baseClass} bg-blue-500/10 border border-blue-500/20`}>
        <Clock className="w-4 h-4 text-blue-400" />
      </div>
    );
  }
  if (type === "webhook") {
    return (
      <div className={`${baseClass} bg-purple-500/10 border border-purple-500/20`}>
        <Webhook className="w-4 h-4 text-purple-400" />
      </div>
    );
  }
  return (
    <div className={`${baseClass} bg-amber-500/10 border border-amber-500/20`}>
      <Zap className="w-4 h-4 text-amber-400" />
    </div>
  );
}
