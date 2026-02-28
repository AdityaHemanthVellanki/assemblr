import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { DashboardShell } from "@/components/dashboard/shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ProfileProvider } from "@/components/profile/profile-provider";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 1. Check Session
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    if (userError) {
      console.error("[DashboardLayout] getUser error:", userError.message);
    } else {
      console.warn("[DashboardLayout] No user found, redirecting to /login");
    }
    redirect("/login");
  }

  // 2. Check Org Membership
  const { data: membership } = await supabase
    .from("memberships")
    .select("role, org_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const role = (membership?.role as any) ?? "viewer";

  // 3. First-time user detection — redirect to onboarding if no integrations connected
  const cookieStore = await cookies();
  const skipOnboarding = cookieStore.get("onboarding_completed");

  if (!skipOnboarding) {
    // No org membership at all → brand new user, must onboard
    if (!membership?.org_id) {
      redirect("/onboarding");
    }

    // Has org but check if they have any connected integrations
    const { count } = await supabase
      .from("org_integrations")
      .select("id", { count: "exact", head: true })
      .eq("org_id", membership.org_id)
      .eq("status", "active");

    if (count === 0 || count === null) {
      // Also check if there's a workspace with events (in case they skipped onboarding previously)
      const { data: projects } = await supabase
        .from("projects")
        .select("id, spec")
        .eq("org_id", membership.org_id)
        .limit(5);

      const hasWorkspace = projects?.some(
        (p) => (p.spec as any)?.type === "skill_graph_workspace",
      );

      if (!hasWorkspace) {
        redirect("/onboarding");
      }
    }
  }

  return (
    <ProfileProvider>
      <DashboardShell>{children}</DashboardShell>
    </ProfileProvider>
  );
}
