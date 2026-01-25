import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/shell";
import { requireOrgMember, OrgRole } from "@/lib/auth/permissions.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 1. Check Session (Read-Only, Once)
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 2. Check Org Membership (Uses cached session/context if optimized, or fetches)
  // We keep the existing logic but ensure it doesn't trigger refresh loops.
  // requireOrgMember should ideally use the session we just got, but changing signature is hard.
  // We rely on getSessionOnce being cached.
  let role: OrgRole;
  try {
    const { ctx } = await requireOrgMember();
    role = ctx.org.role as OrgRole;
  } catch (err) {
      // If requireOrgMember fails (e.g. no org), handle it.
      // But we know session exists.
      throw err;
  }

  return <DashboardShell role={role}>{children}</DashboardShell>;
}
