import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";
import { getServerSession } from "next-auth/next";

import { NewProjectButton } from "@/components/dashboard/new-project-button";
import { Button } from "@/components/ui/button";
import { authOptions } from "@/lib/auth/auth-options";
import { prisma } from "@/lib/db/prisma";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const orgId = session?.user.orgId;

  if (!orgId) {
    return (
      <div className="mx-auto w-full max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle>Projects</CardTitle>
            <CardDescription>Missing organization context.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const projects = await prisma.project.findMany({
    where: { orgId },
    select: { id: true, name: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="mx-auto w-full max-w-4xl">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle>Projects</CardTitle>
              <CardDescription>
                Projects are dashboard workspaces defined by a deterministic
                spec.
              </CardDescription>
            </div>
            <NewProjectButton />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {projects.length === 0 ? (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">
                No projects yet. Create one to start rendering from a stored
                spec.
              </div>
              <NewProjectButton label="Create your first project" />
            </div>
          ) : (
            <div className="divide-y divide-border rounded-md border border-border">
              {projects.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Updated{" "}
                      {new Intl.DateTimeFormat("en", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(p.updatedAt)}
                    </div>
                  </div>
                  <Button asChild variant="outline">
                    <Link href={`/dashboard/projects/${p.id}`}>Open</Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
