"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Check } from "lucide-react";
import { INTEGRATION_ICONS } from "@/components/use-cases/integration-badge";

export type SyncNotification = {
  integrationId: string;
  integrationName: string;
  status: "syncing" | "done";
  eventCount?: number;
};

export function SyncToast({
  notifications,
}: {
  notifications: SyncNotification[];
}) {
  if (notifications.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      <AnimatePresence mode="popLayout">
        {notifications.map((n) => {
          const iconData = INTEGRATION_ICONS[n.integrationId];
          return (
            <motion.div
              key={n.integrationId}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="flex items-center gap-3 rounded-xl border border-border/40 bg-card/80 px-4 py-3 shadow-lg backdrop-blur-xl"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-card/50">
                {iconData ? (
                  <div className="flex h-4 w-4 items-center justify-center">
                    {iconData.icon}
                  </div>
                ) : (
                  <div className="h-4 w-4 rounded bg-muted" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {n.status === "syncing" ? (
                    <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
                  ) : (
                    <Check className="h-3 w-3 text-emerald-400" />
                  )}
                  <span className="text-sm font-medium text-foreground">
                    {n.integrationName}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {n.status === "syncing"
                    ? "Syncing data..."
                    : `${n.eventCount ?? 0} events synced`}
                </p>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
