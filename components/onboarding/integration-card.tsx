"use client";

import { motion } from "framer-motion";
import { Check, Loader2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { INTEGRATION_ICONS } from "@/components/use-cases/integration-badge";
import { staggerItem } from "@/lib/ui/motion";

export type CardStatus = "idle" | "connecting" | "connected" | "syncing";

export function IntegrationCard({
  id,
  name,
  category,
  description,
  status,
  eventCount,
  onConnect,
}: {
  id: string;
  name: string;
  category: string;
  description: string;
  status: CardStatus;
  eventCount?: number;
  onConnect: () => void;
}) {
  const iconData = INTEGRATION_ICONS[id];
  const isConnected = status === "connected" || status === "syncing";

  return (
    <motion.div
      variants={staggerItem}
      whileHover={!isConnected ? { y: -4, transition: { duration: 0.2 } } : {}}
      className={cn(
        "group relative flex flex-col rounded-2xl border p-4 backdrop-blur-sm transition-all duration-300",
        isConnected
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-border/40 bg-card/20 hover:border-primary/40 hover:bg-card/30",
      )}
    >
      {/* Connected glow */}
      {isConnected && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 rounded-2xl shadow-[0_0_30px_-5px] shadow-emerald-500/10"
        />
      )}

      {/* Syncing shimmer overlay */}
      {status === "syncing" && (
        <div className="absolute inset-0 overflow-hidden rounded-2xl">
          <div className="shimmer absolute inset-0 opacity-30" />
        </div>
      )}

      <div className="relative flex items-start justify-between">
        {/* Icon + Info */}
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-200",
              iconData?.bg || "bg-muted",
              !isConnected && "group-hover:scale-105",
            )}
          >
            {iconData ? (
              <div className="flex h-5 w-5 items-center justify-center">
                {iconData.icon}
              </div>
            ) : (
              <Link2 className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">{name}</h3>
            <p className="text-xs text-muted-foreground/60">{category}</p>
          </div>
        </div>

        {/* Status badge / Connect button */}
        <div className="ml-2 shrink-0">
          {status === "idle" && (
            <Button
              variant="outline"
              size="sm"
              onClick={onConnect}
              className="h-8 rounded-lg border-border/60 px-3 text-xs hover:border-primary/50 hover:bg-primary/5"
            >
              Connect
            </Button>
          )}
          {status === "connecting" && (
            <div className="flex h-8 items-center gap-1.5 rounded-lg border border-border/40 bg-card/30 px-3">
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">...</span>
            </div>
          )}
          {isConnected && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.1 }}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3"
            >
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-xs font-medium text-emerald-400">
                Connected
              </span>
            </motion.div>
          )}
        </div>
      </div>

      {/* Description */}
      <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground/50 line-clamp-2">
        {description}
      </p>

      {/* Sync status */}
      {status === "syncing" && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mt-2 flex items-center gap-1.5"
        >
          <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
          <span className="text-xs text-blue-400">Syncing data...</span>
        </motion.div>
      )}

      {/* Event count (when synced) */}
      {status === "connected" && eventCount !== undefined && eventCount > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-2 text-xs text-emerald-400/70"
        >
          {eventCount} events synced
        </motion.div>
      )}
    </motion.div>
  );
}
