"use client";

import { motion } from "framer-motion";
import { fadeIn } from "@/lib/ui/motion";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="relative flex min-h-dvh items-center justify-center bg-background p-6 overflow-hidden"
    >
      {/* Decorative blur orbs */}
      <div className="absolute top-1/3 -left-40 h-80 w-80 rounded-full bg-blue-500/8 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/3 -right-40 h-80 w-80 rounded-full bg-indigo-500/8 blur-3xl pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 h-64 w-[600px] rounded-full bg-purple-500/5 blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">{children}</div>
    </motion.div>
  );
}
