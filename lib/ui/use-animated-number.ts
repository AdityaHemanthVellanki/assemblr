"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animates a number from 0 (or previous value) to the target value.
 * Uses requestAnimationFrame for smooth 60fps animation.
 *
 * @param target - The target number to animate to
 * @param duration - Animation duration in ms (default 800)
 * @returns The current animated value
 */
export function useAnimatedNumber(target: number, duration = 800): number {
  const [current, setCurrent] = useState(0);
  const prevTarget = useRef(0);
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    const from = prevTarget.current;
    const to = target;
    prevTarget.current = target;

    if (from === to) {
      setCurrent(to);
      return;
    }

    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = from + (to - from) * eased;

      setCurrent(value);

      if (progress < 1) {
        rafId.current = requestAnimationFrame(animate);
      } else {
        setCurrent(to);
      }
    };

    rafId.current = requestAnimationFrame(animate);

    return () => {
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, [target, duration]);

  return current;
}
