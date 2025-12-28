import { notFound } from "next/navigation";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth/auth-options";
import { prisma } from "@/lib/db/prisma";
import { SpecEditorPanel } from "@/components/dashboard/spec-editor-panel";
import { parseDashboardSpec } from "@/lib/dashboard/spec";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  const orgId = session?.user.orgId;
  if (!orgId) notFound();

  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: { id, orgId },
    select: { id: true, name: true, spec: true },
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
        }}
      />
    </div>
  );
}
