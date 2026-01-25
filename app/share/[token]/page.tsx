import { notFound, redirect } from "next/navigation";

import { ProjectWorkspace } from "@/components/dashboard/project-workspace";
import { getServerEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseToolSpec } from "@/lib/spec/toolSpec";

export default async function SharedToolPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  getServerEnv();
  
  // Optional: Check for user session if we want to show user context
  const client = await createSupabaseServerClient();
  const { data: { user } } = await client.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await client
      .from("profiles")
      .select("name, avatar_url")
      .eq("id", user.id)
      .single();
    profile = data;
  }
  
  // We do NOT block access for unauthenticated users (Public Share)
  
  const { token } = await params;
  const supabase = createSupabaseAdminClient();
  const { data: share } = await (supabase.from("tool_shares") as any)
    .select("tool_id, org_id, scope, version_id, created_by")
    .eq("token", token)
    .single();

  if (!share?.tool_id) {
    notFound();
  }

  const [projectRes, renderStateRes, messagesRes, ownerRes] = await Promise.all([
    (supabase.from("projects") as any)
      .select("id, spec, active_version_id, org_id, status, error_message")
      .eq("id", share.tool_id)
      .single(),
    (supabase.from("tool_render_state") as any)
      .select("snapshot, view_spec")
      .eq("tool_id", share.tool_id)
      .eq("org_id", share.org_id)
      .single(),
    supabase
      .from("chat_messages")
      .select("role, content, metadata")
      .eq("tool_id", share.tool_id)
      .order("created_at", { ascending: true }),
    (supabase.from("profiles") as any)
      .select("name")
      .eq("id", share.created_by)
      .single(),
  ]);

  if (!projectRes?.data) notFound();

  let spec = null;
  let specError: string | null = null;
  let viewSpec = renderStateRes?.data?.view_spec ?? null;
  let dataSnapshot = renderStateRes?.data?.snapshot ?? null;

  if (share.scope === "version" && share.version_id) {
    const { data: version } = await (supabase.from("tool_versions") as any)
      .select("tool_spec, view_spec, data_snapshot")
      .eq("id", share.version_id)
      .single();
    if (version?.tool_spec) {
      const parsed = parseToolSpec(version.tool_spec);
      if (parsed.ok) {
        spec = parsed.spec;
      } else {
        specError = parsed.error;
      }
    }
    if (version?.view_spec) {
      viewSpec = version.view_spec;
    }
    if (version?.data_snapshot) {
      dataSnapshot = version.data_snapshot;
    }
  }

  if (!spec && projectRes.data.spec) {
    const parsed = parseToolSpec(projectRes.data.spec);
    if (parsed.ok) {
      spec = parsed.spec;
    } else {
      specError = parsed.error;
    }
  }

  const messages = (messagesRes?.data ?? []).map((m: { role: string; content: string }) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  return (
    <ProjectWorkspace
      user={user}
      profile={profile}
      project={{
        id: projectRes.data.id,
        status: projectRes.data.status,
        error_message: projectRes.data.error_message,
        spec,
        spec_error: specError,
        view_spec: viewSpec,
        data_snapshot: dataSnapshot,
      }}
      initialMessages={messages}
      role="viewer"
      readOnly
      shareOwnerName={ownerRes?.data?.name ?? "Someone"}
      shareScope={share.scope === "version" ? "version" : "all"}
      shareVersionId={share.version_id ?? null}
    />
  );
}
