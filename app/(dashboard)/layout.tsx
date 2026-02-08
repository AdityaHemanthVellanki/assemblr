import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ProfileProvider } from "@/components/profile/profile-provider";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 1. Check Session (Read-Only, Once)
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    if (userError) {
      console.error("[DashboardLayout] getUser error:", userError.message);
    } else {
      console.warn("[DashboardLayout] No user found, redirecting to /login");
    }
    redirect("/login");
  }

  console.log("[DashboardLayout] Authenticated user:", user.email);

  // 2. Check Org Membership
  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  // Default to viewer if no membership found to allow shell rendering
  // Ideally we would redirect to an onboarding flow if they have no org.
  const role = (membership?.role as any) ?? "viewer";

  return (
    <ProfileProvider>
      <DashboardShell>{children}</DashboardShell>
    </ProfileProvider>
  );
}
