"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fadeUp, staggerContainer } from "@/lib/ui/motion";
import { IntegrationCard, type CardStatus } from "./integration-card";
import { INTEGRATIONS_UI } from "@/lib/integrations/registry";

const CATEGORIES = [
  "All",
  "Engineering",
  "Messaging",
  "CRM",
  "Productivity",
  "Communication",
  "Support",
  "Analytics",
  "Payments",
] as const;

const RECOMMENDED_COUNT = 3;

export type IntegrationState = Record<
  string,
  { status: CardStatus; eventCount?: number }
>;

export function IntegrationsStep({
  integrationStates,
  onConnect,
  onContinue,
  onSkip,
}: {
  integrationStates: IntegrationState;
  onConnect: (integrationId: string) => void;
  onContinue: () => void;
  onSkip: () => void;
}) {
  const [activeCategory, setActiveCategory] = useState<string>("All");

  const connectedCount = useMemo(
    () =>
      Object.values(integrationStates).filter(
        (s) => s.status === "connected" || s.status === "syncing",
      ).length,
    [integrationStates],
  );

  const filteredIntegrations = useMemo(
    () =>
      INTEGRATIONS_UI.filter(
        (i) => activeCategory === "All" || i.category === activeCategory,
      ),
    [activeCategory],
  );

  // Only show categories that have integrations
  const activeCategories = useMemo(() => {
    const cats = new Set(INTEGRATIONS_UI.map((i) => i.category));
    return CATEGORIES.filter((c) => c === "All" || cats.has(c));
  }, []);

  const progressPercent = Math.min(
    (connectedCount / RECOMMENDED_COUNT) * 100,
    100,
  );

  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      className="flex flex-col px-4 pb-32"
    >
      {/* Header */}
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-center"
        >
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Connect your tools
          </h2>
          <p className="mt-2 text-sm text-muted-foreground/70">
            Select the tools your team uses. We&apos;ll sync data in the
            background as you connect.
          </p>
        </motion.div>

        {/* Progress bar */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mx-auto max-w-md space-y-2"
        >
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {connectedCount} connected
            </span>
            <div className="flex items-center gap-1.5">
              {connectedCount >= RECOMMENDED_COUNT ? (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 15 }}
                >
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                </motion.div>
              ) : null}
              <span className="text-muted-foreground/60">
                {RECOMMENDED_COUNT} recommended
              </span>
            </div>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-border/30">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500"
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ type: "spring", stiffness: 100, damping: 20 }}
            />
          </div>
        </motion.div>

        {/* Category filter */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex justify-center"
        >
          <LayoutGroup>
            <div className="flex flex-wrap justify-center gap-2">
              {activeCategories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    "relative rounded-full px-4 py-1.5 text-xs font-medium transition-colors duration-200",
                    activeCategory === cat
                      ? "text-white"
                      : "text-muted-foreground/70 hover:text-foreground",
                  )}
                >
                  {activeCategory === cat && (
                    <motion.div
                      layoutId="category-pill"
                      className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-500 to-purple-500"
                      transition={{
                        type: "spring",
                        stiffness: 300,
                        damping: 30,
                      }}
                    />
                  )}
                  <span className="relative z-10">{cat}</span>
                </button>
              ))}
            </div>
          </LayoutGroup>
        </motion.div>

        {/* Integration grid */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
        >
          <AnimatePresence mode="popLayout">
            {filteredIntegrations.map((integration) => {
              const state = integrationStates[integration.id] || {
                status: "idle" as const,
              };
              return (
                <IntegrationCard
                  key={integration.id}
                  id={integration.id}
                  name={integration.name}
                  category={integration.category}
                  description={integration.description}
                  status={state.status}
                  eventCount={state.eventCount}
                  onConnect={() => onConnect(integration.id)}
                />
              );
            })}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Bottom action bar */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/20 bg-background/80 backdrop-blur-xl"
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <button
            onClick={onSkip}
            className="text-sm text-muted-foreground/60 transition-colors hover:text-foreground"
          >
            Skip for now
          </button>
          <Button
            size="lg"
            onClick={onContinue}
            disabled={connectedCount === 0}
            className={cn(
              "group gap-2 rounded-xl px-6 font-semibold transition-all",
              connectedCount > 0
                ? "bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg shadow-primary/20"
                : "",
            )}
          >
            Continue
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
