import { notFound } from "next/navigation";

import {
  canEditProjects,
  canGenerateSpec,
  canManageDataSources,
  getSessionContext,
  PermissionError,
  requireUserRole,
} from "@/lib/auth/permissions";
import { SpecEditorPanel } from "@/components/dashboard/spec-editor-panel";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { parseDashboardSpec } from "@/lib/dashboard/spec";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let ctx: Awaited<ReturnType<typeof getSessionContext>>;
  let role: Awaited<ReturnType<typeof requireUserRole>>["role"];
  try {
    ctx = await getSessionContext();
    ({ role } = await requireUserRole(ctx));
  } catch (err) {
    if (err instanceof PermissionError) {
      return (
        <div className="mx-auto w-full max-w-5xl">
          <Card>
            <CardHeader>
              <CardTitle>Project</CardTitle>
              <CardDescription>{err.message}</CardDescription>
            </CardHeader>
          </Card>
        </div>
      );
    }
    throw err;
  }

  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const projectRes = await supabase
    .from("projects")
    .select("id, name, spec, data_source_id")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();

  if (projectRes.error) {
    throw new Error("Failed to load project");
  }
  if (!projectRes.data) notFound();

  const spec = parseDashboardSpec(projectRes.data.spec);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-6 space-y-1">
        <div className="text-sm text-muted-foreground">Project</div>
        <div className="text-xl font-semibold tracking-tight">
          {projectRes.data.name}
        </div>
      </div>
      <SpecEditorPanel
        project={{
          id: projectRes.data.id as string,
          name: projectRes.data.name as string,
          spec,
          dataSourceId: (projectRes.data.data_source_id as string | null) ?? null,
        }}
        permissions={{
          canEdit: canEditProjects(role),
          canGenerate: canGenerateSpec(role),
          canManageDataSources: canManageDataSources(role),
        }}
      />
    </div>
  );
}
