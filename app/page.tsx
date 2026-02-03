"use client";

import * as React from "react";
import Link from "next/link";
import { LazyMotion, m, useReducedMotion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

function EnterSystemButton({ children, className }: { children: React.ReactNode; className?: string }) {
  const router = useRouter();
  const handleEnter = React.useCallback(async () => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      router.push("/app/chat");
    } else {
      router.push("/login");
    }
  }, [router]);

  return (
    <Button onClick={handleEnter} size="lg" className={`rounded-full ${className ?? ""}`}>
      {children}
    </Button>
  );
}

const heroFailedBuilds = [
  {
    repo: "assemblr-web",
    commit: "a8f3c21",
    reason: "Snapshot mismatch",
    time: "Today 10:42",
    owner: "Mira K.",
  },
  {
    repo: "assemblr-core",
    commit: "9b72f10",
    reason: "Integration tests failing",
    time: "Today 10:31",
    owner: "Dylan P.",
  },
  {
    repo: "assemblr-api",
    commit: "3f1d0c9",
    reason: "Build step timed out",
    time: "Today 10:12",
    owner: "Rae J.",
  },
];

const heroSlackDrafts = [
  { owner: "Mira K.", channel: "#deploys", preview: "CI failed in assemblr-web. Snapshot mismatch in auth flow." },
  { owner: "Dylan P.", channel: "#eng-platform", preview: "Integration tests failing in assemblr-core. Can you take a look?" },
  { owner: "Rae J.", channel: "#on-call", preview: "assemblr-api build timed out. Need triage on build step." },
];

const heroSuggestions = [
  "Group by failure type",
  "Open related PRs",
  "Create incident tracker",
  "Escalate to on-call",
];

const simulationSteps = [
  {
    title: "Intent captured",
    detail: "Natural language parsed into a system objective.",
  },
  {
    title: "Integrations activate",
    detail: "Permissions and scopes align across sources.",
  },
  {
    title: "Logic composes",
    detail: "Pipelines, joins, and policies assemble.",
  },
  {
    title: "UI renders",
    detail: "Views materialize with live data.",
  },
  {
    title: "Runtime goes live",
    detail: "Automations run with governed access.",
  },
];

const integrations = [
  { name: "GitHub", status: "linked" },
  { name: "Slack", status: "linked" },
  { name: "Monitoring", status: "linked" },
  { name: "Notion", status: "standby" },
  { name: "Calendar", status: "standby" },
];

const useCases = [
  {
    id: "ops-command",
    title: "Incident Intelligence System",
    subtitle: "Ops Command Center",
    accent: "from-blue-500/40 via-indigo-500/20 to-purple-500/40",
    sections: [
      {
        title: "Failed Builds",
        rows: ["checkout-service · 2 failures", "infra-runner · 4 incidents", "api-gateway · degraded"],
      },
      {
        title: "Incident Feed",
        rows: ["P1 auth outage · 6 threads", "CDN rollback · 3 signals", "Data delay · 12m"],
      },
      {
        title: "Commit Status",
        rows: ["main · blocked", "release-1.6 · running", "hotfix · verified"],
      },
      {
        title: "Alert Stream",
        rows: ["Latency +18%", "Error burst 502", "Queue depth 4x"],
      },
      {
        title: "Resolution Timeline",
        rows: ["09:12 Detect", "09:16 Escalate", "09:25 Mitigate"],
      },
    ],
  },
  {
    id: "business-ops",
    title: "Internal Operations Console",
    subtitle: "Business Operations Hub",
    accent: "from-indigo-500/40 via-purple-500/20 to-blue-500/40",
    sections: [
      {
        title: "Task Orchestration",
        rows: ["Renewals · 12", "Onboarding · 4", "Escalations · 3"],
      },
      {
        title: "Team Calendar Sync",
        rows: ["Leadership sync · 2pm", "Pipeline review · 4pm", "On-call swap · pending"],
      },
      {
        title: "Inbox Intelligence",
        rows: ["Priority: 6", "Waiting: 18", "Drafts ready: 4"],
      },
      {
        title: "Priority Routing",
        rows: ["High risk · 3", "Billing · 5", "Legal · 2"],
      },
      {
        title: "Workflow Pipelines",
        rows: ["Notion → CRM", "Email → Tasks", "Calendar → Brief"],
      },
    ],
  },
  {
    id: "eng-control",
    title: "Engineering Control Plane",
    subtitle: "Engineering Control Plane",
    accent: "from-purple-500/40 via-blue-500/20 to-indigo-500/40",
    sections: [
      {
        title: "Service Health Grid",
        rows: ["Auth API · 99.3%", "Billing · 98.7%", "Search · 99.8%"],
      },
      {
        title: "Deploy Status",
        rows: ["us-east · green", "eu-west · staging", "apac · blue"],
      },
      {
        title: "Build Pipelines",
        rows: ["core-api · running", "web-app · queued", "worker · success"],
      },
      {
        title: "Error Streams",
        rows: ["Unhandled 500 · 12", "Rate limit · 3", "Timeout · 8"],
      },
      {
        title: "Runtime Health",
        rows: ["Queue latency · 240ms", "Worker load · 68%", "Run success · 99.1%"],
      },
    ],
  },
];

const whyStatements = [
  "System-level orchestration, not point tools",
  "Live permissions and runtime governance",
  "Unified data and UI state",
  "Composable automation with guardrails",
  "Built for enterprise-grade reliability",
];

function HeroCanvas() {
  const reduceMotion = useReducedMotion();
  const fadeUp = (delay: number) => ({
    initial: reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: reduceMotion ? { duration: 0 } : { duration: 0.6, ease: "easeOut", delay },
  });
  return (
    <div className="relative mx-auto w-full max-w-6xl overflow-hidden rounded-[32px] border border-border/60 bg-gradient-to-br from-slate-950/90 via-slate-900/90 to-slate-950/80 p-8 shadow-[0_30px_80px_rgba(6,10,25,0.45)]">
      <div className="pointer-events-none absolute inset-0 rounded-[32px] ring-1 ring-white/5" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(30,41,59,0.55),_transparent_60%)]" />
      <div className="relative space-y-4">
        <div className="flex justify-end">
          <m.div
            className="max-w-xs rounded-2xl border border-border/60 bg-background/60 px-4 py-3 text-xs text-foreground/90 shadow-[0_12px_35px_rgba(6,10,25,0.45)] backdrop-blur-xl"
            {...fadeUp(0)}
          >
            Investigate recent build failures and notify the right owners.
          </m.div>
        </div>
        <m.div className="text-xs text-muted-foreground/70" {...fadeUp(0.1)}>
          Done. Here’s what I found and assembled for you:
        </m.div>

        <m.div
          className="rounded-2xl border border-border/60 bg-background/50 p-4 text-xs shadow-[0_16px_45px_rgba(6,10,25,0.4)] backdrop-blur-xl"
          {...fadeUp(0.2)}
        >
          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-muted-foreground/70">
            <span>Failed Builds</span>
            <span className="text-muted-foreground/60">Live output</span>
          </div>
          <div className="mt-3 grid grid-cols-5 gap-3 border-b border-border/50 pb-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60">
            <span>Repo</span>
            <span>Commit</span>
            <span>Failure</span>
            <span>Timestamp</span>
            <span>Owner</span>
          </div>
          <div className="mt-3 space-y-3">
            {heroFailedBuilds.map((build) => (
              <div key={`${build.repo}-${build.commit}`} className="grid grid-cols-5 gap-3 text-xs text-muted-foreground">
                <span className="text-foreground/90">{build.repo}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{build.commit}</span>
                <span>{build.reason}</span>
                <span>{build.time}</span>
                <span className="text-foreground/80">{build.owner}</span>
              </div>
            ))}
          </div>
        </m.div>

        <m.div
          className="rounded-2xl border border-border/60 bg-background/45 p-4 text-xs shadow-[0_16px_45px_rgba(6,10,25,0.35)] backdrop-blur-xl"
          {...fadeUp(0.35)}
        >
          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-muted-foreground/70">
            <span>Slack Notifications Drafted</span>
            <span className="text-muted-foreground/60">Ready to send</span>
          </div>
          <div className="mt-3 space-y-3">
            {heroSlackDrafts.map((draft) => (
              <div key={`${draft.owner}-${draft.channel}`} className="flex items-start justify-between gap-4 rounded-xl border border-border/50 bg-muted/20 px-3 py-3">
                <div className="space-y-1">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">
                    {draft.owner} · {draft.channel}
                  </div>
                  <div className="text-xs text-foreground/85">{draft.preview}</div>
                </div>
                <div className="mt-1 h-2 w-2 rounded-full bg-blue-400/70 shadow-[0_0_8px_rgba(96,165,250,0.6)]" />
              </div>
            ))}
          </div>
        </m.div>

        <m.div className="flex flex-wrap gap-2 pt-2" {...fadeUp(0.5)}>
          {heroSuggestions.map((chip) => (
            <div
              key={chip}
              className="rounded-full border border-border/60 bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground"
            >
              {chip}
            </div>
          ))}
        </m.div>
      </div>
    </div>
  );
}

function SimulationSection() {
  const [stepIndex, setStepIndex] = React.useState(0);
  const reduceMotion = useReducedMotion();

  React.useEffect(() => {
    const interval = window.setInterval(() => {
      setStepIndex((prev) => (prev + 1) % simulationSteps.length);
    }, 2600);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_1.2fr_1.1fr]">
      <GlassCard className="flex flex-col gap-4">
        <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Intent Block</div>
        <div className="space-y-2">
          <div className="text-lg font-semibold text-foreground/90">
            “Route critical incidents into a live ops tool”
          </div>
          <div className="text-xs text-muted-foreground">
            Semantic parsing extracts goals, constraints, and signals.
          </div>
        </div>
        <div className="mt-auto space-y-3">
          {simulationSteps.map((step, index) => (
            <m.div
              key={step.title}
              className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/10 px-3 py-2 text-xs"
              animate={
                reduceMotion
                  ? undefined
                  : {
                    opacity: index === stepIndex ? 1 : 0.5,
                    borderColor: index === stepIndex ? "rgba(99,102,241,0.5)" : "rgba(148,163,184,0.2)",
                  }
              }
              transition={{ duration: 0.4 }}
            >
              <span className="text-foreground/90">{step.title}</span>
              <span className={`h-2 w-2 rounded-full ${index <= stepIndex ? "bg-blue-400" : "bg-muted"}`} />
            </m.div>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="relative flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Integrations</div>
            <div className="text-base font-semibold">System orchestration fabric</div>
          </div>
          <div className="text-xs text-muted-foreground">Phase {stepIndex + 1}/5</div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {integrations.map((integration, index) => (
            <m.div
              key={integration.name}
              className="rounded-xl border border-border/60 bg-background/40 px-3 py-3 text-xs backdrop-blur"
              animate={
                reduceMotion
                  ? undefined
                  : {
                    opacity: stepIndex >= 1 ? 1 : 0.6,
                    y: stepIndex >= 1 ? 0 : 6,
                  }
              }
              transition={{ duration: 0.4, delay: index * 0.05 }}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground/90">{integration.name}</span>
                <span
                  className={`text-[10px] uppercase tracking-[0.2em] ${integration.status === "linked" ? "text-blue-400" : "text-muted-foreground"
                    }`}
                >
                  {stepIndex >= 1 ? "linked" : "standby"}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
                <m.div
                  className="h-full rounded-full bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-500"
                  animate={
                    reduceMotion
                      ? undefined
                      : { width: stepIndex >= 1 ? "100%" : "40%" }
                  }
                  transition={{ duration: 0.5 }}
                />
              </div>
            </m.div>
          ))}
        </div>
        <m.div
          className="absolute -right-10 top-10 h-24 w-24 rounded-full bg-blue-500/20 blur-3xl"
          animate={reduceMotion ? undefined : { opacity: [0.4, 0.8, 0.4], scale: [1, 1.2, 1] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        />
      </GlassCard>

      <GlassCard className="flex flex-col gap-4">
        <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Live Tool View</div>
        <div className="rounded-2xl border border-border/60 bg-background/40 p-4 text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-foreground/90">Incident Status</span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-blue-400">Live</span>
          </div>
          <div className="mt-3 space-y-2">
            {["P1 auth outage", "CDN rollback", "Database queue"].map((item, index) => (
              <m.div
                key={item}
                className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 px-2 py-2"
                animate={
                  reduceMotion
                    ? undefined
                    : { opacity: stepIndex >= 3 ? 1 : 0.5, x: stepIndex >= 3 ? 0 : -6 }
                }
                transition={{ duration: 0.3, delay: index * 0.1 }}
              >
                <span className="text-foreground/80">{item}</span>
                <span className="h-2 w-2 rounded-full bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.8)]" />
              </m.div>
            ))}
          </div>
        </div>
        <div className="mt-auto rounded-2xl border border-border/60 bg-muted/20 px-3 py-3 text-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Runtime</span>
            <span className="text-blue-400">Active</span>
          </div>
          <m.div
            className="mt-2 h-1.5 w-full rounded-full bg-muted"
            animate={reduceMotion ? undefined : { opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <m.div
              className="h-full rounded-full bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-500"
              animate={reduceMotion ? undefined : { width: ["40%", "85%", "55%"] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
          </m.div>
        </div>
      </GlassCard>
    </div>
  );
}

function UseCasePanel({
  title,
  subtitle,
  accent,
  sections,
}: {
  title: string;
  subtitle: string;
  accent: string;
  sections: Array<{ title: string; rows: string[] }>;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <m.div
      className="relative overflow-hidden rounded-[28px] border border-border/60 bg-muted/10 p-6 shadow-[0_16px_50px_rgba(8,10,25,0.35)]"
      whileHover={{ y: -6 }}
      transition={{ duration: 0.3 }}
    >
      <div className={`absolute inset-0 opacity-70 blur-3xl ${accent}`} />
      <div className="relative space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">{subtitle}</div>
            <div className="text-xl font-semibold text-foreground/90">{title}</div>
          </div>
          <m.div
            className="h-2 w-2 rounded-full bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.9)]"
            animate={reduceMotion ? undefined : { opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {sections.map((section) => (
            <div key={section.title} className="rounded-2xl border border-border/60 bg-background/40 p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground/90">{section.title}</span>
                <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Live</span>
              </div>
              <div className="mt-2 space-y-1 text-muted-foreground">
                {section.rows.map((row) => (
                  <div key={row} className="flex items-center justify-between">
                    <span>{row}</span>
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400/70" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
          {["Signals flowing", "Automation armed", "Owners notified"].map((item) => (
            <div key={item} className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-foreground/80">{item}</span>
                <span className="h-2 w-2 rounded-full bg-indigo-400/70" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </m.div>
  );
}

function GlassCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-[28px] border border-border/60 bg-background/40 p-6 shadow-[0_16px_45px_rgba(8,10,25,0.3)] backdrop-blur-xl ${className ?? ""}`}>
      {children}
    </div>
  );
}

function UseCaseCard({
  title,
  description,
  requiredIntegrations,
  prompt,
}: {
  title: string;
  description: string;
  requiredIntegrations: string[];
  prompt: string;
}) {
  const router = useRouter();
  const click = React.useCallback(() => {
    const params = new URLSearchParams();
    params.set("prompt", prompt);
    params.set("integrations", requiredIntegrations.join(","));
    router.push(`/app/chat?${params.toString()}`);
  }, [router, prompt, requiredIntegrations]);

  return (
    <button
      type="button"
      onClick={click}
      className="rounded-2xl border border-border/60 bg-muted/10 p-5 text-left transition hover:border-primary/40 hover:shadow-[0_16px_40px_rgba(8,10,25,0.35)]"
    >
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold text-foreground/90">{title}</div>
        <div className="flex items-center gap-1">
          {requiredIntegrations.map((id) => (
            <span
              key={`${id}-${title}`}
              className="inline-flex items-center rounded-md border border-border/60 bg-background/50 px-2 py-0.5 text-xs text-muted-foreground"
            >
              {id}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-2 text-sm text-muted-foreground">{description}</div>
    </button>
  );
}

export default function Home() {
  return (
    <LazyMotion features={() => import("framer-motion").then((mod) => mod.domAnimation)}>
      <div className="dark min-h-dvh bg-background text-foreground">
        {/* Navigation Header */}
        <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/30 bg-background/80 backdrop-blur-xl">
          <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600">
                <span className="text-sm font-bold text-white">A</span>
              </div>
              <span className="text-lg font-semibold">Assemblr</span>
            </Link>
            <div className="flex items-center gap-6">
              <Link
                href="/use-cases"
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Use Cases
              </Link>
              <EnterSystemButton className="h-9 px-4 text-sm">
                Go to Chat
              </EnterSystemButton>
            </div>
          </nav>
        </header>

        <main className="relative overflow-hidden pt-20">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(30,41,59,0.75),_transparent_60%),radial-gradient(circle_at_20%_20%,_rgba(59,130,246,0.2),_transparent_50%)]" />
          <section className="mx-auto flex max-w-6xl flex-col gap-10 px-6 pb-14 pt-16 sm:pb-20 sm:pt-24">
            <div className="text-center space-y-4">
              <div className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                Assemblr
              </div>
              <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
                Words to tools in{" "}
                <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-500 bg-clip-text text-transparent">
                  seconds
                </span>
              </h1>
              <p className="mx-auto max-w-3xl text-base text-muted-foreground sm:text-lg">
                Assemblr builds real internal tools, dashboards, and systems from natural language — on top of your existing stack.
              </p>
            </div>
            <HeroCanvas />
            <div className="flex justify-center pt-4">
              <EnterSystemButton>Enter the system</EnterSystemButton>
            </div>
          </section>

          <section className="mx-auto max-w-6xl px-6 py-16">
            <div className="mb-6 flex items-center justify-between">
              <div className="space-y-2">
                <h2 className="text-3xl font-semibold">Use Case Discovery</h2>
                <p className="text-muted-foreground">
                  Choose a real-world workflow. Assemblr will open Chat and run it instantly.
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/20 px-3 py-1.5 text-xs">
                <span>Featured</span>
                <span className="text-muted-foreground">Engineering</span>
                <span className="text-muted-foreground">Design</span>
                <span className="text-muted-foreground">Marketing</span>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <UseCaseCard
                title="Daily Email Digest"
                description="Summarize important emails received today and send a concise digest."
                requiredIntegrations={["google"]}
                prompt="Compile a summary of today's important emails and send a digest to me."
              />
              <UseCaseCard
                title="Weekly Goals Review"
                description="Review Linear issues and create a weekly summary in Notion."
                requiredIntegrations={["linear", "notion"]}
                prompt="Review all my Linear issues from this week and create a structured weekly summary in Notion."
              />
              <UseCaseCard
                title="Morning Meeting Briefing"
                description="Compile a briefing for today's meetings with prep suggestions."
                requiredIntegrations={["google"]}
                prompt="Create a concise daily briefing for today's meetings with prep suggestions, and highlight scheduling conflicts."
              />
              <UseCaseCard
                title="Incident Intelligence"
                description="Detect recent GitHub build failures and coordinate Slack notifications."
                requiredIntegrations={["github", "slack"]}
                prompt="Find recent build failures on GitHub and draft Slack notifications to the relevant owners."
              />
              <UseCaseCard
                title="Weekly Changelog Generator"
                description="Summarize merged PRs and changes across repos for the week."
                requiredIntegrations={["github", "notion"]}
                prompt="Review all merged PRs across our GitHub repos this week and generate a weekly changelog summary in Notion."
              />
              <UseCaseCard
                title="Linear Sprint Summary"
                description="Summarize completed issues, blockers, and planned work."
                requiredIntegrations={["linear", "slack"]}
                prompt="Create a sprint summary from Linear including completed issues, blockers, and upcoming priorities, then share on Slack."
              />
            </div>
          </section>

          <section className="mx-auto max-w-6xl px-6 py-16">
            <div className="mb-8 text-center space-y-3">
              <h2 className="text-3xl font-semibold">Interactive product simulation</h2>
              <p className="text-muted-foreground">
                A live Assemblr builder experience: intent to runtime in one sequence.
              </p>
            </div>
            <SimulationSection />
          </section>

          <section className="mx-auto max-w-6xl px-6 py-16">
            <div className="mb-8 text-center space-y-3">
              <h2 className="text-3xl font-semibold">Enterprise-grade use cases</h2>
              <p className="text-muted-foreground">
                Each system is a real internal tool, designed for high-trust teams.
              </p>
            </div>
            <div className="grid gap-8 lg:grid-cols-3">
              {useCases.map((useCase) => (
                <UseCasePanel
                  key={useCase.id}
                  title={useCase.title}
                  subtitle={useCase.subtitle}
                  accent={useCase.accent}
                  sections={useCase.sections}
                />
              ))}
            </div>
          </section>

          <section className="mx-auto max-w-5xl px-6 py-16">
            <div className="mb-8 text-center space-y-3">
              <h2 className="text-3xl font-semibold">Built like a system</h2>
              <p className="text-muted-foreground">
                Assemblr feels like an AI infrastructure layer, not a marketing site.
              </p>
            </div>
            <div className="grid gap-3">
              {whyStatements.map((statement) => (
                <div
                  key={statement}
                  className="flex items-center justify-between rounded-2xl border border-border/60 bg-muted/10 px-5 py-4 text-sm"
                >
                  <span className="text-foreground/90">{statement}</span>
                  <span className="text-xs text-muted-foreground">Verified</span>
                </div>
              ))}
            </div>
          </section>

          <section className="mx-auto max-w-5xl px-6 pb-20 pt-6">
            <div className="rounded-[32px] border border-border/60 bg-gradient-to-br from-slate-950/80 via-slate-900/80 to-indigo-950/70 px-8 py-12 text-center shadow-2xl">
              <div className="mx-auto max-w-2xl space-y-4">
                <h2 className="text-3xl font-semibold">This is not an app. It is a system.</h2>
                <p className="text-sm text-muted-foreground">
                  Build the platform your teams run on — with Assemblr orchestrating data, logic, and UI.
                </p>
                <div className="flex justify-center pt-4">
                  <EnterSystemButton>Launch Assemblr</EnterSystemButton>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </LazyMotion>
  );
}
