import { type Variants, type Transition } from "framer-motion";

// ─── Spring Presets ────────────────────────────────────────────────
export const springBouncy: Transition = {
  type: "spring",
  stiffness: 300,
  damping: 20,
};

export const springSmooth: Transition = {
  type: "spring",
  stiffness: 200,
  damping: 25,
};

export const springGentle: Transition = {
  type: "spring",
  stiffness: 120,
  damping: 20,
};

// ─── Duration Presets ──────────────────────────────────────────────
export const durationFast: Transition = { duration: 0.15, ease: "easeOut" };
export const durationBase: Transition = { duration: 0.2, ease: "easeOut" };
export const durationSlow: Transition = {
  duration: 0.35,
  ease: [0.16, 1, 0.3, 1],
};

// ─── Reusable Variants ────────────────────────────────────────────

/** Fade up from below — pass delay as custom prop */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: (delay: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] },
  }),
};

/** Simple opacity fade */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: (delay: number = 0) => ({
    opacity: 1,
    transition: { duration: 0.4, delay },
  }),
};

/** Scale in from slightly smaller */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: "spring", stiffness: 200, damping: 25 },
  },
};

/** Slide in from right */
export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 30 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: "spring", stiffness: 200, damping: 25 },
  },
  exit: { opacity: 0, x: 30, transition: { duration: 0.2 } },
};

/** Slide in from left */
export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -30 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: "spring", stiffness: 200, damping: 25 },
  },
  exit: { opacity: 0, x: -30, transition: { duration: 0.2 } },
};

// ─── Stagger Orchestrators ─────────────────────────────────────────

/** Parent container that staggers children */
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
};

/** Child item for stagger containers */
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] },
  },
};

// ─── List Item (with height animation for add/remove) ──────────────

export const listItem: Variants = {
  hidden: { opacity: 0, x: -10, height: 0 },
  visible: {
    opacity: 1,
    x: 0,
    height: "auto",
    transition: { type: "spring", stiffness: 200, damping: 25 },
  },
  exit: { opacity: 0, x: 10, height: 0, transition: { duration: 0.15 } },
};

// ─── Page Transition Variants ──────────────────────────────────────

export const pageTransition: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] },
  },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
};

// ─── Hover Presets ─────────────────────────────────────────────────

export const hoverScale = {
  whileHover: { scale: 1.02, transition: { duration: 0.2 } },
  whileTap: { scale: 0.98 },
};

export const hoverLift = {
  whileHover: { y: -4, transition: { duration: 0.2 } },
  whileTap: { scale: 0.98 },
};

export const hoverLiftScale = {
  whileHover: { y: -4, scale: 1.02, transition: { duration: 0.2 } },
  whileTap: { scale: 0.98 },
};
