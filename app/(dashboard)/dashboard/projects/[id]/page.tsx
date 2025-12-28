import { notFound } from "next/navigation";

import {
  canEditProjects,
  canGenerateSpec,
  canManageDataSources,
  getSessionContext,
  PermissionError,
  requireUserRole,
} from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { SpecEditorPanel } from "@/components/dashboard/spec-editor-panel";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { parseDashboardSpec } from "@/lib/dashboard/spec";

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

  const project = await prisma.project.findFirst({
    where: { id, orgId: ctx.orgId },
    select: { id: true, name: true, spec: true, dataSourceId: true },
  });

  if (!project) notFound();

  const spec = parseDashboardSpec(project.spec);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-6 space-y-1">
        <div className="text-sm text-muted-foreground">Project</div>
        <div className="text-xl font-semibold tracking-tight">
          {project.name}
        </div>
      </div>
      <SpecEditorPanel
        project={{
          id: project.id,
          name: project.name,
          spec,
          dataSourceId: project.dataSourceId ?? null,
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
