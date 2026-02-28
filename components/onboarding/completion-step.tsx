"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { staggerContainer, staggerItem } from "@/lib/ui/motion";
import { INTEGRATION_ICONS } from "@/components/use-cases/integration-badge";
import { cn } from "@/lib/utils";

export function CompletionStep({
  connectedIntegrations,
  onLaunch,
}: {
  connectedIntegrations: { id: string; name: string; eventCount?: number }[];
  onLaunch: () => void;
}) {
  const [countdown, setCountdown] = useState(8);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onLaunch();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [onLaunch]);

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center"
    >
      {/* Expanding rings animation */}
      <motion.div variants={staggerItem} className="relative mb-8">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute left-1/2 top-1/2 rounded-full border border-primary/20"
            initial={{ width: 0, height: 0, x: "-50%", y: "-50%", opacity: 0.6 }}
            animate={{
              width: [0, 160 + i * 60],
              height: [0, 160 + i * 60],
              opacity: [0.6, 0],
            }}
            transition={{
              duration: 2,
              delay: i * 0.3,
              repeat: Infinity,
              repeatDelay: 1,
              ease: "easeOut",
            }}
          />
        ))}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.2 }}
          className="relative z-10 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-xl shadow-emerald-500/25"
        >
          <Check className="h-10 w-10 text-white" strokeWidth={3} />
        </motion.div>
      </motion.div>

      {/* Heading */}
      <motion.h1
        variants={staggerItem}
        className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl"
      >
        You&apos;re all set!
      </motion.h1>

      <motion.p
        variants={staggerItem}
        className="mt-3 max-w-md text-base text-muted-foreground/70"
      >
        {connectedIntegrations.length} tool
        {connectedIntegrations.length !== 1 ? "s" : ""} connected. Assemblr is
        now syncing your data and will start discovering workflows.
      </motion.p>

      {/* Connected integrations summary */}
      {connectedIntegrations.length > 0 && (
        <motion.div
          variants={staggerItem}
          className="mt-8 flex flex-wrap justify-center gap-2"
        >
          {connectedIntegrations.map((integration) => {
            const iconData = INTEGRATION_ICONS[integration.id];
            return (
              <motion.div
                key={integration.id}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{
                  type: "spring",
                  stiffness: 400,
                  damping: 20,
                }}
                className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2"
              >
                <div
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-md",
                    iconData?.bg || "bg-muted",
                  )}
                >
                  {iconData ? (
                    <div className="flex h-3 w-3 items-center justify-center">
                      {iconData.icon}
                    </div>
                  ) : null}
                </div>
                <span className="text-sm font-medium text-foreground">
                  {integration.name}
                </span>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* CTA */}
      <motion.div variants={staggerItem} className="mt-10">
        <Button
          size="lg"
          onClick={onLaunch}
          className="group h-12 gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 px-8 text-base font-semibold text-white shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/30"
        >
          Explore your workflows
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Button>
      </motion.div>

      {/* Auto-redirect countdown */}
      <motion.p
        variants={staggerItem}
        className="mt-4 text-xs text-muted-foreground/40"
      >
        Redirecting in {countdown}s...
      </motion.p>
    </motion.div>
  );
}
