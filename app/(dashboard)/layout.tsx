import { redirect } from "next/navigation";
import Script from "next/script";

import { DashboardShell } from "@/components/dashboard/shell";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionContext, PermissionError, requireUserRole } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let role: Awaited<ReturnType<typeof requireUserRole>>["role"];
  try {
    const ctx = await getSessionContext();
    ({ role } = await requireUserRole(ctx));
  } catch (err) {
    if (err instanceof PermissionError && err.status === 401) redirect("/login");
    if (err instanceof PermissionError) {
      if (err.status === 503 && err.message === "Workspace provisioning") {
        return (
          <div className="mx-auto w-full max-w-3xl p-6">
            <Script id="workspace-provisioning-refresh">{`setTimeout(() => window.location.reload(), 1200);`}</Script>
            <Card>
              <CardHeader>
                <CardTitle>Setting up your workspace…</CardTitle>
                <CardDescription>
                  This can take a moment on first login. Refreshing automatically.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        );
      }
      return (
        <div className="mx-auto w-full max-w-3xl p-6">
          <Card>
            <CardHeader>
              <CardTitle>Access denied</CardTitle>
              <CardDescription>{err.message}</CardDescription>
            </CardHeader>
          </Card>
        </div>
      );
    }
    throw err;
  }

  return <DashboardShell role={role}>{children}</DashboardShell>;
}
