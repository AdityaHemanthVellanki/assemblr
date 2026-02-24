"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NewProjectButton } from "@/components/dashboard/new-project-button";
import {
  fadeUp,
  staggerContainer,
  staggerItem,
  hoverLift,
} from "@/lib/ui/motion";

type ToolProject = {
  id: string;
  name: string;
  updatedAt: Date;
};

export function ToolsGrid({
  projects,
  canEdit,
}: {
  projects: ToolProject[];
  canEdit: boolean;
}) {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <motion.div
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        custom={0}
        className="flex items-center justify-between"
      >
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Tools</h1>
          <p className="text-muted-foreground">
            Build and manage your AI-generated tools.
          </p>
        </div>
        {canEdit ? <NewProjectButton label="Create Tool" /> : null}
      </motion.div>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
      >
        {projects.map((p) => (
          <motion.div key={p.id} variants={staggerItem} {...hoverLift}>
            <Card className="flex flex-col h-full">
              <CardHeader>
                <CardTitle className="truncate">{p.name}</CardTitle>
                <CardDescription>
                  Last updated{" "}
                  {new Intl.DateTimeFormat("en", {
                    dateStyle: "medium",
                  }).format(p.updatedAt)}
                </CardDescription>
              </CardHeader>
              <CardContent className="mt-auto pt-0">
                <Button asChild className="w-full" variant="secondary">
                  <Link href={`/dashboard/projects/${p.id}`}>Open Workspace</Link>
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        ))}

        {projects.length === 0 && (
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={0.1}
            className="col-span-full rounded-lg border border-dashed border-border/60 p-12 text-center transition-colors hover:border-primary/30"
          >
            <h3 className="mb-2 text-lg font-semibold">No tools created yet</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Start by creating your first tool with AI.
            </p>
            {canEdit ? (
              <NewProjectButton label="Create Tool" />
            ) : (
              <Button disabled variant="outline">
                Create Tool (Read-only)
              </Button>
            )}
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
