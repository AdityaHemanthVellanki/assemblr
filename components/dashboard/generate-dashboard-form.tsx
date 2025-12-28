"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/ui/cn";

export function GenerateDashboardForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [prompt, setPrompt] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onGenerate() {
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/generate-spec`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "Failed to generate dashboard");
      }

      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate dashboard",
      );
    } finally {
      setIsLoading(false);
    }
  }

  const isDisabled = isLoading || prompt.trim().length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          Generate dashboard spec
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder='e.g. "Create a dashboard showing daily revenue and new users"'
          className={cn(
            "min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring",
          )}
          maxLength={800}
        />
        <div className="flex items-center justify-between gap-4">
          <div className="text-xs text-muted-foreground">
            {prompt.length}/800
          </div>
          <Button type="button" onClick={onGenerate} disabled={isDisabled}>
            {isLoading ? "Generating…" : "Generate Dashboard"}
          </Button>
        </div>
        {error ? (
          <div className="rounded-md border border-border bg-accent px-3 py-2 text-sm">
            {error}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
