import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  canEditProjects,
  getRequestContext,
  PermissionError,
  requireOrgMember,
  OrgRole
} from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ToolsGrid } from "@/components/dashboard/tools-grid";

export default async function ToolsPage() {
  let ctx: Awaited<ReturnType<typeof getRequestContext>>;
  let role: OrgRole;
  try {
    ({ ctx } = await requireOrgMember());
    role = ctx.org.role as OrgRole;
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

  return <ToolsGrid projects={projects} canEdit={canEditProjects(role)} />;
}
