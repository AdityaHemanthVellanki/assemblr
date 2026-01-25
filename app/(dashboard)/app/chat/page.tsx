import { ProjectWorkspace } from "@/components/dashboard/project-workspace";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("name, avatar_url")
      .eq("id", user.id)
      .single();
    profile = data;
  }

  const resolvedSearchParams = await searchParams;
  const prompt =
    typeof resolvedSearchParams.prompt === "string"
      ? resolvedSearchParams.prompt
      : null;
  const integrationsParam =
    typeof resolvedSearchParams.integrations === "string"
      ? resolvedSearchParams.integrations
      : null;
  const requiredIntegrations = integrationsParam
    ? integrationsParam
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    : null;

  return (
    <ProjectWorkspace
      user={user}
      profile={profile}
      project={null}
      initialMessages={[]}
      role="viewer"
      initialPrompt={prompt}
      initialRequiredIntegrations={requiredIntegrations}
    />
  );
}
