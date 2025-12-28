"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

export function NewProjectButton({
  label = "New Project",
}: {
  label?: string;
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onClick() {
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "Failed to create project");
      }

      const data = (await res.json()) as { id: string };
      router.push(`/dashboard/projects/${data.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" onClick={onClick} disabled={isLoading}>
        <Plus />
        {label}
      </Button>
      {error ? (
        <div className="text-sm text-muted-foreground">{error}</div>
      ) : null}
    </div>
  );
}
