"use client";

import { CheckCircle2, AlertCircle, Loader2, RefreshCw, Clock } from "lucide-react";
import { cn } from "@/lib/ui/cn";
import { Button } from "@/components/ui/button";

export type IntegrationStatus = {
  id: string;
  name: string;
  status: "idle" | "syncing" | "done" | "error";
  lastSync?: string;
  eventCount?: number;
  error?: string;
};

const STATUS_CONFIG: Record<
  IntegrationStatus["status"],
  { icon: typeof CheckCircle2; color: string; label: string }
> = {
  idle: { icon: Clock, color: "text-muted-foreground", label: "Not synced" },
  syncing: { icon: Loader2, color: "text-blue-400", label: "Syncing..." },
  done: { icon: CheckCircle2, color: "text-emerald-400", label: "Synced" },
  error: { icon: AlertCircle, color: "text-red-400", label: "Error" },
};

/** Icons for known integrations */
const INTEGRATION_LABELS: Record<string, string> = {
  github: "GitHub",
  slack: "Slack",
  linear: "Linear",
  notion: "Notion",
  hubspot: "HubSpot",
  trello: "Trello",
  intercom: "Intercom",
  gitlab: "GitLab",
  bitbucket: "Bitbucket",
  asana: "Asana",
  clickup: "ClickUp",
  zoom: "Zoom",
  microsoft_teams: "MS Teams",
  outlook: "Outlook",
  discord: "Discord",
  airtable: "Airtable",
  stripe: "Stripe",
  google_analytics: "Analytics",
  quickbooks: "QuickBooks",
  google: "Google",
};

function formatTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function IntegrationHealthPanel({
  integrations,
  onSync,
  onSyncSingle,
  isSyncing,
}: {
  integrations: IntegrationStatus[];
  onSync: () => void;
  onSyncSingle?: (id: string) => void;
  isSyncing: boolean;
}) {
  const syncedCount = integrations.filter((i) => i.status === "done").length;
  const errorCount = integrations.filter((i) => i.status === "error").length;
  const totalEvents = integrations.reduce(
    (sum, i) => sum + (i.eventCount || 0),
    0,
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Integration Health
          </h2>
          <p className="text-sm text-muted-foreground">
            {syncedCount}/{integrations.length} synced
            {errorCount > 0 && (
              <span className="text-red-400"> · {errorCount} errors</span>
            )}
            {totalEvents > 0 && (
              <span> · {totalEvents.toLocaleString()} events</span>
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onSync}
          disabled={isSyncing}
          className="gap-2"
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", isSyncing && "animate-spin")}
          />
          {isSyncing ? "Syncing..." : "Sync All"}
        </Button>
      </div>

      {/* Integration Grid */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {integrations.map((integration) => {
          const config = STATUS_CONFIG[integration.status];
          const StatusIcon = config.icon;

          return (
            <button
              key={integration.id}
              onClick={() => onSyncSingle?.(integration.id)}
              disabled={isSyncing}
              className={cn(
                "group relative flex flex-col gap-1.5 rounded-xl border border-border/40 bg-card/20 p-3 text-left transition-all",
                "hover:border-primary/30 hover:bg-card/40",
                integration.status === "error" && "border-red-500/30 bg-red-500/5",
                integration.status === "syncing" && "border-blue-500/30 bg-blue-500/5",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">
                  {INTEGRATION_LABELS[integration.id] || integration.name}
                </span>
                <StatusIcon
                  className={cn(
                    "h-4 w-4",
                    config.color,
                    integration.status === "syncing" && "animate-spin",
                  )}
                />
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{config.label}</span>
                {integration.lastSync && (
                  <span>· {formatTimeAgo(integration.lastSync)}</span>
                )}
              </div>
              {integration.eventCount !== undefined &&
                integration.eventCount > 0 && (
                  <div className="text-xs text-muted-foreground/70">
                    {integration.eventCount} events
                  </div>
                )}
              {integration.error && (
                <div className="text-xs text-red-400 truncate">
                  {integration.error}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
