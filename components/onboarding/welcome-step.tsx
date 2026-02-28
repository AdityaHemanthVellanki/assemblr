"use client";

import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fadeUp, staggerContainer, staggerItem } from "@/lib/ui/motion";

export function WelcomeStep({
  userName,
  onContinue,
}: {
  userName: string;
  onContinue: () => void;
}) {
  const firstName = userName.split(" ")[0] || "there";

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center"
    >
      {/* Floating icon */}
      <motion.div
        variants={staggerItem}
        className="mb-8"
      >
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 backdrop-blur-sm"
        >
          <Sparkles className="h-10 w-10 text-blue-400" />
        </motion.div>
      </motion.div>

      {/* Heading */}
      <motion.h1
        variants={staggerItem}
        className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl"
      >
        Welcome, {firstName}
      </motion.h1>

      {/* Subtitle */}
      <motion.p
        variants={staggerItem}
        className="mt-4 max-w-lg text-lg text-muted-foreground/80 sm:text-xl"
      >
        Let&apos;s connect your tools so Assemblr can discover your
        team&apos;s recurring workflows
      </motion.p>

      {/* Animated gradient line */}
      <motion.div
        variants={staggerItem}
        className="mt-8 h-px w-40 bg-gradient-to-r from-transparent via-primary/50 to-transparent"
      />

      {/* Features preview */}
      <motion.div
        variants={staggerItem}
        className="mt-8 flex flex-wrap justify-center gap-3"
      >
        {["Cross-system patterns", "Automated workflows", "Real-time sync"].map(
          (feature) => (
            <span
              key={feature}
              className="rounded-full border border-border/40 bg-card/20 px-4 py-1.5 text-xs font-medium text-muted-foreground/70 backdrop-blur-sm"
            >
              {feature}
            </span>
          ),
        )}
      </motion.div>

      {/* CTA */}
      <motion.div variants={staggerItem} className="mt-12">
        <Button
          size="lg"
          onClick={onContinue}
          className="group h-12 gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 px-8 text-base font-semibold text-white shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/30"
        >
          Get Started
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Button>
      </motion.div>
    </motion.div>
  );
}
