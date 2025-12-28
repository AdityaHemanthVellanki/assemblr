import { redirect } from "next/navigation";

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
