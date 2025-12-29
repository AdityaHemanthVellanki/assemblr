import { notFound } from "next/navigation";

import { ProjectWorkspace } from "@/components/dashboard/project-workspace";
import { requireOrgMember, requireProjectOrgAccess, canViewDashboards } from "@/lib/auth/permissions";
import { getServerEnv } from "@/lib/env";
import { dashboardSpecSchema } from "@/lib/spec/dashboardSpec";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  getServerEnv();
  const { id: toolId } = await params;

  // 1. Auth & Access
  const { ctx, role } = await requireOrgMember();
  
  if (!canViewDashboards(role)) {
    // Should handle this better (e.g. 403 page), but for now...
    throw new Error("Unauthorized");
  }

  await requireProjectOrgAccess(ctx, toolId);

  const supabase = await createSupabaseServerClient();

  // 2. Fetch Project & Messages
  const projectResPromise = supabase.from("projects").select("*").eq("id", toolId).single();

  const messagesRes = await supabase
    .from("chat_messages")
    .select("role, content")
    .eq("tool_id", toolId)
    .order("created_at", { ascending: true });

  const projectRes = await projectResPromise;

  if (!projectRes.data) notFound();

  // 3. Parse Spec
  let spec = null;
  if (projectRes.data.spec) {
    try {
      spec = dashboardSpecSchema.parse(projectRes.data.spec);
    } catch (e) {
      console.error("Failed to parse project spec", e);
      // Don't crash, just show empty/error state
    }
  }

  const messages = (messagesRes.data ?? []).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  return (
    <ProjectWorkspace
      project={{ id: projectRes.data.id, spec }}
      initialMessages={messages}
    />
  );
}
