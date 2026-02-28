"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { label: "Welcome" },
  { label: "Connect" },
  { label: "Launch" },
];

export function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-3">
      {STEPS.map((step, i) => {
        const isCompleted = i < currentStep;
        const isActive = i === currentStep;

        return (
          <div key={step.label} className="flex items-center gap-3">
            {i > 0 && (
              <div
                className={cn(
                  "h-px w-8 transition-colors duration-500",
                  isCompleted ? "bg-primary" : "bg-border/40",
                )}
              />
            )}
            <div className="flex items-center gap-2">
              <motion.div
                layout
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-all duration-300",
                  isCompleted &&
                    "bg-primary text-primary-foreground",
                  isActive &&
                    "bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg shadow-primary/25",
                  !isCompleted &&
                    !isActive &&
                    "border border-border/60 bg-card/30 text-muted-foreground",
                )}
                animate={{
                  scale: isActive ? 1.15 : 1,
                }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
              >
                {isCompleted ? (
                  <motion.div
                    initial={{ scale: 0, rotate: -90 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </motion.div>
                ) : (
                  <span>{i + 1}</span>
                )}
              </motion.div>
              <span
                className={cn(
                  "hidden text-xs font-medium sm:block",
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground/60",
                )}
              >
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
