"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCasesByCategory } from "@/lib/use-cases/registry";

const integrationLabels: Record<string, string> = {
  google: "Google",
  github: "GitHub",
  slack: "Slack",
  notion: "Notion",
  linear: "Linear",
};

export default function UseCasesPage() {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-10 px-6 py-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Use Cases</h1>
        <p className="text-sm text-muted-foreground">
          Production-grade tools with real integrations, built for both personal and enterprise use.
        </p>
      </div>

      <div className="space-y-10">
        {useCasesByCategory.map((group) => (
          <section key={group.category} className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{group.category}</h2>
              <span className="text-xs text-muted-foreground">{group.items.length} tools</span>
            </div>
            {group.items.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                No tools defined in this category yet.
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {group.items.map((tool) => (
                  <Card key={tool.id} className="flex h-full flex-col">
                    <CardHeader className="space-y-2">
                      <CardTitle className="text-base">{tool.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">{tool.description}</p>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col gap-4">
                      <div className="flex flex-wrap gap-2">
                        {tool.integrations.map((integration) => (
                          <span
                            key={`${tool.id}-${integration}`}
                            className="rounded-full border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground"
                          >
                            {integrationLabels[integration] ?? integration}
                          </span>
                        ))}
                      </div>

                      <div className="grid gap-2 text-xs text-muted-foreground">
                        <div>
                          <span className="font-medium text-foreground">Trigger:</span> {tool.trigger}
                        </div>
                        <div>
                          <span className="font-medium text-foreground">Output:</span> {tool.output}
                        </div>
                      </div>

                      <div className="mt-auto flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            const params = new URLSearchParams();
                            params.set("prompt", tool.prompt);
                            params.set("integrationMode", "manual");
                            params.set("integrations", tool.integrations.join(","));
                            router.push(`/app/chat?${params.toString()}`);
                          }}
                        >
                          Try this tool
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const params = new URLSearchParams();
                            params.set("prompt", tool.prompt);
                            params.set("integrations", tool.integrations.join(","));
                            router.push(`/app/chat?${params.toString()}`);
                          }}
                        >
                          Open in chat
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
