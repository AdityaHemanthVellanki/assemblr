import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";

import { NewProjectButton } from "@/components/dashboard/new-project-button";
import { Button } from "@/components/ui/button";
import {
  canEditProjects,
  getSessionContext,
  PermissionError,
  requireUserRole,
} from "@/lib/auth/permissions.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ToolsPage() {
  let ctx: Awaited<ReturnType<typeof getSessionContext>>;
  let role: Awaited<ReturnType<typeof requireUserRole>>["role"];
  try {
    ctx = await getSessionContext();
    ({ role } = await requireUserRole(ctx));
  } catch (err) {
    if (err instanceof PermissionError) {
      return (
        <div className="mx-auto w-full max-w-6xl">
          <Card>
            <CardHeader>
              <CardTitle>Tools</CardTitle>
              <CardDescription>{err.message}</CardDescription>
            </CardHeader>
          </Card>
        </div>
      );
    }
    throw err;
  }

  const supabase = await createSupabaseServerClient();
  const projectsRes = await supabase
    .from("projects")
    .select("id, name, updated_at")
    .eq("org_id", ctx.orgId)
    .order("updated_at", { ascending: false });

  if (projectsRes.error) {
    throw new Error("Failed to load tools");
  }

  if (!projectsRes.data) {
    throw new Error("Failed to load tools");
  }

  const projects = projectsRes.data.map((p) => ({
    id: p.id as string,
    name: p.name as string,
    updatedAt: new Date(p.updated_at as string),
  }));

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Tools</h1>
          <p className="text-muted-foreground">
            Build and manage your AI-generated tools.
          </p>
        </div>
        {canEditProjects(role) ? <NewProjectButton label="Create Tool" /> : null}
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => (
          <Card key={p.id} className="flex flex-col">
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
        ))}

        {projects.length === 0 && (
          <div className="col-span-full rounded-lg border border-dashed p-12 text-center">
            <h3 className="mb-2 text-lg font-semibold">No tools created yet</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Start by creating your first tool with AI.
            </p>
            {canEditProjects(role) ? (
              <NewProjectButton label="Create Tool" />
            ) : (
              <Button disabled variant="outline">
                Create Tool (Read-only)
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
