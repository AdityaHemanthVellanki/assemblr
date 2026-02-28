"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, ArrowUp, Activity, MessageSquare, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  fadeUp,
  staggerContainer,
  staggerItem,
} from "@/lib/ui/motion";
import {
  IntegrationHealthPanel,
  type IntegrationStatus,
} from "@/components/dashboard/integration-health";
import {
  MiningStatusPanel,
  type MiningStatusData,
} from "@/components/dashboard/mining-status";
import { SkillGraphList } from "@/components/dashboard/skill-graph-viewer";
import type { SkillGraph } from "@/lib/skillgraph/compiler/skill-schema";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export const dynamic = "force-dynamic";

export default function AppHomePage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [miningData, setMiningData] = useState<MiningStatusData>({
    stage: "idle",
    patternCount: 0,
    crossSystemCount: 0,
    eventCount: 0,
    nodeCount: 0,
    edgeCount: 0,
  });
  const [skills, setSkills] = useState<SkillGraph[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isMining, setIsMining] = useState(false);
  const [hasData, setHasData] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatting, setIsChatting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load workspace state
  const loadWorkspace = useCallback(async () => {
    try {
      const res = await fetch("/api/skillgraph/status");
      if (!res.ok) return;
      const data = await res.json();

      if (data.integrations) {
        setIntegrations(data.integrations);
      }
      if (data.mining) {
        setMiningData(data.mining);
      }
      if (data.skills) {
        setSkills(data.skills);
      }
      // Only show dashboard panels when we actually have meaningful data
      setHasData(
        (data.mining?.eventCount ?? 0) > 0 ||
          (data.integrations?.length ?? 0) > 0,
      );
    } catch {
      // API might not exist yet — show empty state
    }
  }, []);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isChatting) return;

    const userMsg = prompt.trim();
    setPrompt("");
    setChatMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setIsChatting(true);

    try {
      const res = await fetch("/api/skillgraph/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          history: chatMessages,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.message },
        ]);
      } else {
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Sorry, I couldn't process that request." },
        ]);
      }
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Connection error. Please try again." },
      ]);
    } finally {
      setIsChatting(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/skillgraph/ingest", { method: "POST" });
      if (res.ok) {
        // Poll for status updates with backoff: 5s intervals for 60s max (12 polls vs 60)
        let pollCount = 0;
        const pollInterval = setInterval(async () => {
          pollCount++;
          if (pollCount > 12) {
            clearInterval(pollInterval);
            return;
          }
          await loadWorkspace();
        }, 5000);
        setTimeout(() => clearInterval(pollInterval), 60_000);
      }
    } catch (err) {
      console.error("Sync failed:", err);
    } finally {
      setIsSyncing(false);
      await loadWorkspace();
    }
  };

  const handleSyncSingle = async (integrationId: string) => {
    setIsSyncing(true);
    try {
      await fetch("/api/skillgraph/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integrationId }),
      });
    } catch (err) {
      console.error("Sync failed:", err);
    } finally {
      setIsSyncing(false);
      await loadWorkspace();
    }
  };

  const handleMine = async () => {
    setIsMining(true);
    try {
      await fetch("/api/skillgraph/mine", { method: "POST" });
    } catch (err) {
      console.error("Mining failed:", err);
    } finally {
      setIsMining(false);
      await loadWorkspace();
    }
  };

  return (
    <div className="flex h-full flex-col bg-background overflow-y-auto">
      {/* ── Hero / Welcome Section — always visible ── */}
      <div className="flex flex-col items-center justify-center px-4 pt-16 pb-8 text-center">
        <div className="mx-auto w-full max-w-3xl space-y-10">
          <div className="space-y-4">
            <motion.h1
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={0}
              className="text-5xl font-bold tracking-tight sm:text-6xl md:text-7xl"
            >
              Discover your{" "}
              <span className="animated-gradient-text bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
                workflows
              </span>
            </motion.h1>
            <motion.p
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={0.1}
              className="mx-auto max-w-2xl text-lg text-muted-foreground/80 sm:text-xl"
            >
              Connect your tools and Assemblr will discover recurring
              behavioral patterns across your organization
            </motion.p>
          </div>

          {/* Input Area */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={0.2}
            className="mx-auto w-full max-w-2xl"
          >
            <form
              onSubmit={handleSubmit}
              className="gradient-border-focus relative flex items-center rounded-2xl border border-border/40 bg-card/30 p-2 shadow-lg transition-all focus-within:border-primary/50 focus-within:bg-card/50 focus-within:shadow-primary/5 focus-within:ring-1 focus-within:ring-primary/50"
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="flex h-9 items-center gap-1.5 rounded-xl border border-border/50 bg-background/50 px-3 text-xs font-medium text-muted-foreground hover:bg-background hover:text-foreground"
                onClick={() => router.push("/dashboard/integrations")}
              >
                <Plus className="h-3.5 w-3.5" />
                Connect tools
              </Button>
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Explore workflows across your tools..."
                className="flex-1 bg-transparent px-4 py-3 text-base text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                autoFocus
                disabled={isChatting}
              />
              <motion.div
                animate={{
                  scale: prompt.trim() ? 1 : 0.9,
                  opacity: prompt.trim() ? 1 : 0.5,
                }}
                transition={{ duration: 0.15 }}
              >
                <Button
                  type="submit"
                  size="icon"
                  disabled={!prompt.trim() || isChatting}
                  className={cn(
                    "h-9 w-9 rounded-xl transition-all",
                    prompt.trim()
                      ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {isChatting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowUp className="h-4 w-4" />
                  )}
                  <span className="sr-only">Send</span>
                </Button>
              </motion.div>
            </form>
          </motion.div>

          {/* Chat Messages */}
          <AnimatePresence>
            {chatMessages.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mx-auto max-w-2xl rounded-xl border border-border/40 bg-card/20 p-4"
              >
                <div className="max-h-80 space-y-3 overflow-y-auto">
                  {chatMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={cn(
                        "text-sm",
                        msg.role === "user"
                          ? "text-muted-foreground"
                          : "text-foreground",
                      )}
                    >
                      <span className="font-medium text-xs uppercase tracking-wide text-muted-foreground/70">
                        {msg.role === "user" ? "You" : "Assemblr"}
                      </span>
                      <div className="mt-1 whitespace-pre-wrap">{msg.content}</div>
                    </div>
                  ))}
                  {isChatting && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Analyzing...
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Quick Start Cards — shown when no data yet */}
          {!hasData && (
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="grid gap-4 sm:grid-cols-3"
            >
              {[
                {
                  icon: Plus,
                  title: "Connect Tools",
                  description:
                    "Link GitHub, Slack, Linear, and 14 more integrations",
                  action: () => router.push("/dashboard/integrations"),
                  color: "text-blue-500",
                  bg: "bg-blue-500/10",
                },
                {
                  icon: Activity,
                  title: "Ingest Data",
                  description:
                    "Pull historical events from all connected tools",
                  action: handleSync,
                  color: "text-emerald-500",
                  bg: "bg-emerald-500/10",
                },
                {
                  icon: Activity,
                  title: "Mine Patterns",
                  description:
                    "Discover recurring behavioral workflows automatically",
                  action: handleMine,
                  color: "text-purple-500",
                  bg: "bg-purple-500/10",
                },
              ].map((card) => (
                <motion.div
                  key={card.title}
                  variants={staggerItem}
                  onClick={card.action}
                  className="group cursor-pointer rounded-2xl border border-border/40 bg-card/20 p-6 text-left transition-colors hover:border-primary/30 hover:bg-card/40 hover:shadow-lg"
                >
                  <div
                    className={`mb-4 flex h-10 w-10 items-center justify-center rounded-lg transition-transform group-hover:scale-110 ${card.bg} ${card.color}`}
                  >
                    <card.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mb-2 font-semibold text-foreground group-hover:text-primary transition-colors">
                    {card.title}
                  </h3>
                  <p className="text-xs text-muted-foreground line-clamp-3">
                    {card.description}
                  </p>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </div>

      {/* ── Dashboard Panels — shown below hero when data exists ── */}
      {hasData && (
        <div className="px-4 pb-12 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl space-y-8">
            {/* Integration Health */}
            <motion.div
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={0.3}
            >
              <IntegrationHealthPanel
                integrations={integrations}
                onSync={handleSync}
                onSyncSingle={handleSyncSingle}
                isSyncing={isSyncing}
              />
            </motion.div>

            {/* Mining Status */}
            <motion.div
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={0.4}
            >
              <MiningStatusPanel
                data={miningData}
                onRunMining={handleMine}
                isRunning={isMining}
              />
            </motion.div>

            {/* Discovered Skills */}
            {skills.length > 0 && (
              <motion.div
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                custom={0.5}
              >
                <SkillGraphList skills={skills} />
              </motion.div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
