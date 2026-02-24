"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, ArrowUp, Zap, Calendar, Mail } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  fadeUp,
  staggerContainer,
  staggerItem,
  hoverLiftScale,
} from "@/lib/ui/motion";

export const dynamic = "force-dynamic";

export default function AppHomePage() {
    const router = useRouter();
    const [prompt, setPrompt] = useState("");

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!prompt.trim()) return;
        router.push(`/app/chat?prompt=${encodeURIComponent(prompt)}`);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    const EXAMPLE_CARDS = [
        {
            icon: Zap,
            title: "Sprint Planning",
            description: "Look at Linear and create a sprint plan for the next 2 weeks",
            prompt: "Look at Linear and create a sprint plan for the next 2 weeks based on the current backlog and team velocity.",
            color: "text-blue-500",
            bg: "bg-blue-500/10",
        },
        {
            icon: Calendar,
            title: "Summarize Meetings",
            description: "Summarize my key meetings this week from Google Calendar",
            prompt: "Connect to Google Calendar and summarize my key meetings for this week, highlighting validation outcomes and action items.",
            color: "text-orange-500",
            bg: "bg-orange-500/10",
        },
        {
            icon: Mail,
            title: "Scan Emails",
            description: "Check my emails and send out meetings to anyone needed",
            prompt: "Scan my Gmail for urgent requests and draft calendar invites for anyone who needs a meeting.",
            color: "text-red-500",
            bg: "bg-red-500/10",
        },
    ];

    return (
        <div className="flex h-full flex-col items-center justify-center bg-background px-4 text-center">
            <div className="mx-auto w-full max-w-3xl space-y-12">

                {/* Headings */}
                <div className="space-y-4">
                    <motion.h1
                        variants={fadeUp}
                        initial="hidden"
                        animate="visible"
                        custom={0}
                        className="text-5xl font-bold tracking-tight sm:text-6xl md:text-7xl"
                    >
                        Words to tools in{" "}
                        <span className="animated-gradient-text bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
                            seconds
                        </span>
                    </motion.h1>
                    <motion.p
                        variants={fadeUp}
                        initial="hidden"
                        animate="visible"
                        custom={0.1}
                        className="mx-auto max-w-2xl text-lg text-muted-foreground/80 sm:text-xl"
                    >
                        Assemblr is your AI agent to build fully functional tools and apps on top of your tech stack
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
                        {/* Add Integration Button */}
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="flex h-9 items-center gap-1.5 rounded-xl border border-border/50 bg-background/50 px-3 text-xs font-medium text-muted-foreground hover:bg-background hover:text-foreground"
                            onClick={() => router.push("/dashboard/integrations")}
                        >
                            <Plus className="h-3.5 w-3.5" />
                            Add integration
                        </Button>

                        {/* Input Field */}
                        <input
                            type="text"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Ask anything..."
                            className="flex-1 bg-transparent px-4 py-3 text-base text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                            autoFocus
                        />

                        {/* Send Button */}
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
                                disabled={!prompt.trim()}
                                className={cn(
                                    "h-9 w-9 rounded-xl transition-all",
                                    prompt.trim()
                                        ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                                        : "bg-muted text-muted-foreground"
                                )}
                            >
                                <ArrowUp className="h-4 w-4" />
                                <span className="sr-only">Send</span>
                            </Button>
                        </motion.div>
                    </form>
                </motion.div>

                {/* Example Cards */}
                <motion.div
                    variants={staggerContainer}
                    initial="hidden"
                    animate="visible"
                    className="grid gap-4 sm:grid-cols-3"
                >
                    {EXAMPLE_CARDS.map((card) => (
                        <motion.div
                            key={card.title}
                            variants={staggerItem}
                            {...hoverLiftScale}
                            onClick={() => router.push(`/app/chat?prompt=${encodeURIComponent(card.prompt)}`)}
                            className="group cursor-pointer rounded-2xl border border-border/40 bg-card/20 p-6 text-left transition-colors hover:border-primary/30 hover:bg-card/40 hover:shadow-lg"
                        >
                            <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-lg transition-transform group-hover:scale-110 ${card.bg} ${card.color}`}>
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

            </div>
        </div>
    );
}
