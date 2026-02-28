"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { StepIndicator } from "@/components/onboarding/step-indicator";
import { WelcomeStep } from "@/components/onboarding/welcome-step";
import {
  IntegrationsStep,
  type IntegrationState,
} from "@/components/onboarding/integrations-step";
import { CompletionStep } from "@/components/onboarding/completion-step";
import {
  SyncToast,
  type SyncNotification,
} from "@/components/onboarding/sync-toast";
import { startOAuthFlow } from "@/app/actions/oauth";
import { INTEGRATIONS_UI } from "@/lib/integrations/registry";

type OnboardingStep = 0 | 1 | 2;

const STEP_KEY = "assemblr_onboarding_step";
const CONNECTED_KEY = "assemblr_onboarding_connected";

/** Slide animation variants for step transitions */
const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 200 : -200,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -200 : 200,
    opacity: 0,
  }),
};

export default function OnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<OnboardingStep>(0);
  const [direction, setDirection] = useState(1);
  const [userName, setUserName] = useState("");
  const [integrationStates, setIntegrationStates] = useState<IntegrationState>(
    {},
  );
  const [syncNotifications, setSyncNotifications] = useState<
    SyncNotification[]
  >([]);
  const syncPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isBootstrapped, setIsBootstrapped] = useState(false);

  // Bootstrap: ensure user has an org (required for OAuth connect flows)
  useEffect(() => {
    fetch("/api/onboarding/bootstrap", { method: "POST" })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          console.error("[Onboarding] Bootstrap failed:", data.error);
        } else {
          console.log("[Onboarding] Bootstrap OK, org:", data.orgId);
        }
        setIsBootstrapped(true);
      })
      .catch((err) => {
        console.error("[Onboarding] Bootstrap error:", err);
        setIsBootstrapped(true); // Continue anyway
      });
  }, []);

  // Load persisted state from sessionStorage (survives OAuth round-trips)
  useEffect(() => {
    const savedStep = sessionStorage.getItem(STEP_KEY);
    if (savedStep) {
      setStep(parseInt(savedStep, 10) as OnboardingStep);
    }

    const savedConnected = sessionStorage.getItem(CONNECTED_KEY);
    if (savedConnected) {
      try {
        const parsed = JSON.parse(savedConnected);
        setIntegrationStates(parsed);
      } catch {
        // ignore
      }
    }
  }, []);

  // Persist state to sessionStorage on changes
  useEffect(() => {
    sessionStorage.setItem(STEP_KEY, String(step));
  }, [step]);

  useEffect(() => {
    if (Object.keys(integrationStates).length > 0) {
      sessionStorage.setItem(CONNECTED_KEY, JSON.stringify(integrationStates));
    }
  }, [integrationStates]);

  // Handle OAuth return — check URL params for integration_connected
  useEffect(() => {
    const connected = searchParams.get("integration_connected");
    const integrationId = searchParams.get("integrationId");

    if (connected === "true" && integrationId) {
      // Resolve Assemblr ID from Composio appName if needed
      const resolvedId = resolveIntegrationId(integrationId);

      // Mark as connected + start syncing
      setIntegrationStates((prev) => ({
        ...prev,
        [resolvedId]: { status: "syncing" },
      }));

      // Make sure we're on step 1 (integrations)
      setStep(1);

      // Trigger background ingestion for this integration
      triggerIngestion(resolvedId);

      // Clean URL params
      const url = new URL(window.location.href);
      url.searchParams.delete("integration_connected");
      url.searchParams.delete("integrationId");
      window.history.replaceState({}, "", url.pathname);
    }
  }, [searchParams]);

  // Load user profile name
  useEffect(() => {
    fetch("/api/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.name) setUserName(data.name);
      })
      .catch(() => {});
  }, []);

  // Load already-connected integrations on mount
  useEffect(() => {
    fetch("/api/skillgraph/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.integrations) return;
        const states: IntegrationState = {};
        for (const i of data.integrations) {
          if (i.status === "done" || i.status === "syncing") {
            states[i.id] = {
              status: i.status === "done" ? "connected" : "syncing",
              eventCount: i.eventCount,
            };
          }
        }
        if (Object.keys(states).length > 0) {
          setIntegrationStates((prev) => ({ ...prev, ...states }));
        }
      })
      .catch(() => {});
  }, []);

  // Poll sync status for actively syncing integrations
  useEffect(() => {
    const syncingIds = Object.entries(integrationStates)
      .filter(([, s]) => s.status === "syncing")
      .map(([id]) => id);

    if (syncingIds.length === 0) {
      if (syncPollRef.current) {
        clearInterval(syncPollRef.current);
        syncPollRef.current = null;
      }
      return;
    }

    if (syncPollRef.current) return; // already polling

    syncPollRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/skillgraph/status");
        if (!res.ok) return;
        const data = await res.json();
        if (!data?.integrations) return;

        setIntegrationStates((prev) => {
          const next = { ...prev };
          for (const i of data.integrations) {
            if (next[i.id]?.status === "syncing" && i.status === "done") {
              next[i.id] = { status: "connected", eventCount: i.eventCount };
              // Update sync toast
              setSyncNotifications((n) =>
                n.map((t) =>
                  t.integrationId === i.id
                    ? { ...t, status: "done", eventCount: i.eventCount }
                    : t,
                ),
              );
              // Remove toast after 3 seconds
              setTimeout(() => {
                setSyncNotifications((n) =>
                  n.filter((t) => t.integrationId !== i.id),
                );
              }, 3000);
            }
          }
          return next;
        });
      } catch {
        // ignore poll errors
      }
    }, 8000);

    return () => {
      if (syncPollRef.current) {
        clearInterval(syncPollRef.current);
        syncPollRef.current = null;
      }
    };
  }, [integrationStates]);

  const triggerIngestion = useCallback(
    async (integrationId: string) => {
      const name =
        INTEGRATIONS_UI.find((i) => i.id === integrationId)?.name ||
        integrationId;

      // Add sync toast
      setSyncNotifications((prev) => [
        ...prev.filter((n) => n.integrationId !== integrationId),
        { integrationId, integrationName: name, status: "syncing" },
      ]);

      try {
        await fetch("/api/skillgraph/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ integrationId }),
        });
      } catch {
        // Ingestion error — mark as connected anyway (sync can retry later)
        setIntegrationStates((prev) => ({
          ...prev,
          [integrationId]: { status: "connected" },
        }));
      }
    },
    [],
  );

  const handleConnect = useCallback(
    async (integrationId: string) => {
      // Mark as connecting
      setIntegrationStates((prev) => ({
        ...prev,
        [integrationId]: { status: "connecting" },
      }));

      try {
        const url = await startOAuthFlow({
          providerId: integrationId,
          currentPath: "/onboarding",
          integrationMode: "manual",
        });
        // Redirect to OAuth provider
        window.location.href = url;
      } catch (err) {
        console.error("OAuth start failed:", err);
        // Reset to idle on error
        setIntegrationStates((prev) => ({
          ...prev,
          [integrationId]: { status: "idle" },
        }));
      }
    },
    [],
  );

  const goToStep = (newStep: OnboardingStep) => {
    setDirection(newStep > step ? 1 : -1);
    setStep(newStep);
  };

  const handleLaunch = useCallback(() => {
    // Mark onboarding as complete (cookie for server-side check + localStorage for fast path)
    document.cookie = "onboarding_completed=true; path=/; max-age=31536000; SameSite=Lax";
    localStorage.setItem("onboarding_completed", "true");
    sessionStorage.removeItem(STEP_KEY);
    sessionStorage.removeItem(CONNECTED_KEY);
    router.push("/app");
  }, [router]);

  const connectedList = Object.entries(integrationStates)
    .filter(
      ([, s]) => s.status === "connected" || s.status === "syncing",
    )
    .map(([id, s]) => ({
      id,
      name: INTEGRATIONS_UI.find((i) => i.id === id)?.name || id,
      eventCount: s.eventCount,
    }));

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Background effects */}
      <div className="breathing-bg fixed inset-0" />
      <div className="radial-overlay fixed inset-0" />

      {/* Decorative blur orbs */}
      <div className="pointer-events-none fixed -left-32 -top-32 h-96 w-96 rounded-full bg-blue-500/8 blur-3xl" />
      <div className="pointer-events-none fixed -bottom-32 -right-32 h-96 w-96 rounded-full bg-purple-500/8 blur-3xl" />

      {/* Step indicator (top) */}
      <div className="relative z-10 flex justify-center pt-8">
        <StepIndicator currentStep={step} />
      </div>

      {/* Step content with slide transitions */}
      <div className="relative z-10 mt-8">
        <AnimatePresence mode="wait" custom={direction}>
          {step === 0 && (
            <motion.div
              key="welcome"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: "spring", stiffness: 200, damping: 25 }}
            >
              <WelcomeStep
                userName={userName}
                onContinue={() => goToStep(1)}
              />
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="integrations"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: "spring", stiffness: 200, damping: 25 }}
            >
              <IntegrationsStep
                integrationStates={integrationStates}
                onConnect={handleConnect}
                onContinue={() => goToStep(2)}
                onSkip={handleLaunch}
              />
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="completion"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: "spring", stiffness: 200, damping: 25 }}
            >
              <CompletionStep
                connectedIntegrations={connectedList}
                onLaunch={handleLaunch}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Background sync toasts */}
      <SyncToast notifications={syncNotifications} />
    </div>
  );
}

/** Resolve Composio appName to Assemblr integration ID */
function resolveIntegrationId(raw: string): string {
  const lower = raw.toLowerCase();
  // Handle known Composio app name aliases
  const aliases: Record<string, string> = {
    slackbot: "slack",
    googlesheets: "google",
    microsoftteams: "microsoft_teams",
  };
  return aliases[lower] || lower;
}
