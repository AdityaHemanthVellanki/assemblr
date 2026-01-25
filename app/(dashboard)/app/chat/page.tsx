import { ProjectWorkspace } from "@/components/dashboard/project-workspace";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

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
      project={null}
      initialMessages={[]}
      role="viewer"
      initialPrompt={prompt}
      initialRequiredIntegrations={requiredIntegrations}
    />
  );
}
