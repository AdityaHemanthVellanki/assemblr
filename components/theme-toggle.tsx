"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Laptop, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const nextTheme = React.useMemo(() => {
    if (theme === "light") return "dark";
    if (theme === "dark") return "system";
    return "light";
  }, [theme]);

  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Laptop;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => setTheme(nextTheme)}
      aria-label="Toggle theme"
    >
      <Icon />
    </Button>
  );
}
