"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ArrowRight, BarChart3, LineChart, PieChart, Activity, Server, Database, Cloud } from "lucide-react";
import { cn } from "@/lib/ui/cn";

// --- Constants ---
const PROMPT_TEXT = "Build a dashboard to track cloud spend across AWS and GCP, broken down by service and region.";
const TYPING_SPEED_MS = 35; // ms per char
const THINKING_DURATION_MS = 2500;
const GENERATING_DURATION_MS = 1500; // Time for tool to materialize
const DISPLAY_DURATION_MS = 4000; // Time to show final tool before reset
const RESTART_DELAY_MS = 1000;

// --- Phases ---
type Phase = "idle" | "typing" | "thinking" | "generating" | "complete";

export function ProductSimulation() {
    const [phase, setPhase] = React.useState<Phase>("idle");
    const [typedText, setTypedText] = React.useState("");
    const containerRef = React.useRef<HTMLDivElement>(null);

    // --- Sequence Logic ---
    React.useEffect(() => {
        let timeoutId: NodeJS.Timeout;

        const runSequence = async () => {
            // 1. Idle -> Typing
            setPhase("typing");
            setTypedText("");

            // Simulate Typing
            for (let i = 0; i <= PROMPT_TEXT.length; i++) {
                setTypedText(PROMPT_TEXT.slice(0, i));
                await new Promise(r => setTimeout(r, TYPING_SPEED_MS + (Math.random() * 20))); // Add slight randomness
            }

            // 2. Typing -> Thinking (Processing)
            setPhase("thinking");
            await new Promise(r => setTimeout(r, THINKING_DURATION_MS));

            // 3. Thinking -> Generating (Tool appears)
            setPhase("generating");
            await new Promise(r => setTimeout(r, GENERATING_DURATION_MS));

            // 4. Generating -> Complete
            setPhase("complete");
            await new Promise(r => setTimeout(r, DISPLAY_DURATION_MS));

            // 5. Complete -> Reset
            // Fade out? Or just reset text
            setPhase("idle");
            setTypedText("");
            await new Promise(r => setTimeout(r, RESTART_DELAY_MS));

            // Loop
            runSequence();
        };

        // Start only when in view? For now auto-start
        runSequence();

        return () => {
            // Cleanup logic if needed, but async loop is hard to cancel cleanly without AbortController
            // In a real app we'd use a ref to track mounted state
        };
    }, []);

    return (
        <section className="w-full py-24">
            <div className="mx-auto max-w-5xl px-6">
                <div className="rounded-2xl border border-border/40 bg-background/50 shadow-2xl backdrop-blur-xl overflow-hidden relative min-h-[500px] flex flex-col">

                    {/* Top Bar (Browser/App decoration) */}
                    <div className="flex items-center justify-between border-b border-border/40 bg-muted/20 px-4 py-3">
                        <div className="flex items-center gap-2">
                            <div className="h-3 w-3 rounded-full bg-red-500/20" />
                            <div className="h-3 w-3 rounded-full bg-yellow-500/20" />
                            <div className="h-3 w-3 rounded-full bg-green-500/20" />
                        </div>
                        <div className="flex items-center gap-2 rounded-full bg-background/40 px-3 py-1 text-xs text-muted-foreground border border-border/20">
                            <Sparkles className="h-3 w-3 text-indigo-400" />
                            <span>Assemblr AI Generator</span>
                        </div>
                        <div className="w-16" /> {/* Spacer */}
                    </div>

                    {/* Main Content Area */}
                    <div className="relative flex-1 p-6 md:p-10 flex flex-col items-center justify-center">

                        <AnimatePresence mode="wait">
                            {/* PHASE 1 & 2: Chat / Input Interface */}
                            {(phase === "idle" || phase === "typing" || phase === "thinking") && (
                                <motion.div
                                    key="input-stage"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
                                    transition={{ duration: 0.5 }}
                                    className="w-full max-w-2xl flex flex-col gap-6"
                                >
                                    <div className="flex flex-col gap-2 text-center">
                                        <h3 className="text-2xl font-semibold tracking-tight">What would you like to build?</h3>
                                        <p className="text-muted-foreground">Describe your tool in plain English.</p>
                                    </div>

                                    <div className="relative overflow-hidden rounded-xl border border-border/50 bg-background shadow-lg ring-1 ring-white/5 transition-all">
                                        <div className="min-h-[80px] p-4 text-lg md:text-xl font-medium text-foreground/90 font-mono">
                                            {typedText}
                                            {phase === "typing" && (
                                                <motion.span
                                                    animate={{ opacity: [1, 0] }}
                                                    transition={{ repeat: Infinity, duration: 0.8 }}
                                                    className="inline-block h-5 w-0.5 translate-y-1 bg-primary ml-1"
                                                />
                                            )}
                                        </div>

                                        <div className="border-t border-border/40 bg-muted/30 px-4 py-3 flex justify-between items-center">
                                            <div className="flex gap-2">
                                                <div className="h-4 w-4 rounded-sm bg-muted-foreground/20" />
                                                <div className="h-4 w-4 rounded-sm bg-muted-foreground/20" />
                                            </div>
                                            <div className={cn(
                                                "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                                                phase === "thinking" ? "bg-indigo-500/10 text-indigo-400" : "bg-primary text-primary-foreground"
                                            )}>
                                                {phase === "thinking" ? (
                                                    <>
                                                        <Activity className="h-4 w-4 animate-spin" />
                                                        <span>Reasoning...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <span>Generate</span>
                                                        <ArrowRight className="h-4 w-4" />
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {/* Thinking Progress Bar */}
                                        {phase === "thinking" && (
                                            <motion.div
                                                className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"
                                                initial={{ width: "0%" }}
                                                animate={{ width: "100%" }}
                                                transition={{ duration: THINKING_DURATION_MS / 1000, ease: "easeInOut" }}
                                            />
                                        )}
                                    </div>

                                    {phase === "thinking" && (
                                        <motion.div
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className="flex flex-col gap-2 items-center text-sm text-muted-foreground"
                                        >
                                            <StatusStep text="Analyzing data schema..." delay={0.2} />
                                            <StatusStep text="Identifying integrations..." delay={1.0} />
                                            <StatusStep text="Constructing dashboard layout..." delay={1.8} />
                                        </motion.div>
                                    )}
                                </motion.div>
                            )}

                            {/* PHASE 3 & 4: Tool Generated */}
                            {(phase === "generating" || phase === "complete") && (
                                <motion.div
                                    key="tool-stage"
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ type: "spring", stiffness: 200, damping: 25 }}
                                    className="w-full h-full flex flex-col gap-4"
                                >
                                    {/* Tool Header */}
                                    <div className="flex items-center justify-between border-b border-border/40 pb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400">
                                                <BarChart3 className="h-6 w-6" />
                                            </div>
                                            <div>
                                                <h2 className="text-lg font-semibold">Cloud Cost Analyzer</h2>
                                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                    <span className="flex items-center gap-1"><Cloud className="h-3 w-3" /> AWS Connected</span>
                                                    <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
                                                    <span className="flex items-center gap-1"><Cloud className="h-3 w-3" /> GCP Connected</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <div className="h-9 w-24 rounded-md bg-muted/40" />
                                            <div className="h-9 w-9 rounded-md bg-primary/20" />
                                        </div>
                                    </div>

                                    {/* Tool Content Grid */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
                                        {/* Stat Cards */}
                                        <div className="md:col-span-3 grid grid-cols-3 gap-4">
                                            <StatCard label="Total Spend (MTD)" value="$12,450" change="+12%" color="indigo" index={0} />
                                            <StatCard label="projected Forecast" value="$18,200" change="+5%" color="purple" index={1} />
                                            <StatCard label="Usage Anomalies" value="3 Detected" change="High" color="red" index={2} />
                                        </div>

                                        {/* Main Chart */}
                                        <motion.div
                                            className="md:col-span-2 rounded-xl border border-border/40 bg-muted/10 p-4 min-h-[200px] flex flex-col gap-4 relative overflow-hidden"
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.3 }}
                                        >
                                            <div className="flex justify-between items-center">
                                                <h4 className="font-medium text-sm">Daily Cost Trend</h4>
                                                <div className="h-6 w-20 rounded bg-muted/30" />
                                            </div>
                                            <div className="flex-1 flex items-end justify-between gap-1 px-2 pb-2">
                                                {Array.from({ length: 14 }).map((_, i) => (
                                                    <motion.div
                                                        key={i}
                                                        initial={{ height: 0 }}
                                                        animate={{ height: `${20 + Math.random() * 60}%` }}
                                                        transition={{ delay: 0.4 + (i * 0.05), duration: 0.5 }}
                                                        className="w-full bg-indigo-500/30 rounded-t-sm hover:bg-indigo-500/50 transition-colors"
                                                    />
                                                ))}
                                            </div>
                                        </motion.div>

                                        {/* Side Panel */}
                                        <motion.div
                                            className="rounded-xl border border-border/40 bg-muted/10 p-4 flex flex-col gap-3"
                                            initial={{ opacity: 0, x: 20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: 0.4 }}
                                        >
                                            <h4 className="font-medium text-sm">Top Services</h4>
                                            <div className="space-y-3">
                                                <ServiceRow name="EC2 Instances" pct={45} color="bg-orange-500" delay={0.5} />
                                                <ServiceRow name="RDS Database" pct={25} color="bg-blue-500" delay={0.6} />
                                                <ServiceRow name="Lambda Functions" pct={15} color="bg-yellow-500" delay={0.7} />
                                                <ServiceRow name="S3 Storage" pct={10} color="bg-green-500" delay={0.8} />
                                            </div>
                                        </motion.div>
                                    </div>

                                </motion.div>
                            )}
                        </AnimatePresence>

                    </div>
                </div>
            </div>
        </section>
    );
}

// --- Subcomponents ---

function StatusStep({ text, delay }: { text: string; delay: number }) {
    return (
        <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay, duration: 0.3 }}
            className="flex items-center gap-2"
        >
            <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
            <span>{text}</span>
        </motion.div>
    );
}

function StatCard({ label, value, change, color, index }: { label: string, value: string, change: string, color: string, index: number }) {
    return (
        <motion.div
            className="rounded-xl border border-border/40 bg-muted/10 p-4 flex flex-col gap-1"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
        >
            <span className="text-xs text-muted-foreground">{label}</span>
            <div className="flex items-end justify-between">
                <span className="text-xl font-bold">{value}</span>
                <span className="text-xs text-green-400 bg-green-900/20 px-1.5 py-0.5 rounded">{change}</span>
            </div>
        </motion.div>
    );
}

function ServiceRow({ name, pct, color, delay }: { name: string, pct: number, color: string, delay: number }) {
    return (
        <motion.div
            className="flex flex-col gap-1"
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "100%" }}
            transition={{ delay, duration: 0.5 }}
        >
            <div className="flex justify-between text-xs">
                <span>{name}</span>
                <span className="text-muted-foreground">{pct}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted/30 overflow-hidden">
                <motion.div
                    className={cn("h-full rounded-full", color)}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ delay: delay + 0.2, duration: 0.8, ease: "easeOut" }}
                />
            </div>
        </motion.div>
    );
}
