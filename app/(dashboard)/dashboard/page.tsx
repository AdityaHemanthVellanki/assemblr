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
import { canEditProjects, getSessionContext, PermissionError, requireUserRole } from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  let ctx: Awaited<ReturnType<typeof getSessionContext>>;
  let role: Awaited<ReturnType<typeof requireUserRole>>["role"];
  try {
    ctx = await getSessionContext();
    ({ role } = await requireUserRole(ctx));
  } catch (err) {
    if (err instanceof PermissionError) {
      return (
        <div className="mx-auto w-full max-w-4xl">
          <Card>
            <CardHeader>
              <CardTitle>Projects</CardTitle>
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
    throw new Error("Failed to load projects");
  }

  const projects = (projectsRes.data ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    updatedAt: new Date(p.updated_at as string),
  }));

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
            {canEditProjects(role) ? <NewProjectButton /> : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {projects.length === 0 ? (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">
                No projects yet. Create one to start rendering from a stored
                spec.
              </div>
              {canEditProjects(role) ? (
                <NewProjectButton label="Create your first project" />
              ) : (
                <div className="text-sm text-muted-foreground">
                  You have read-only access.
                </div>
              )}
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
