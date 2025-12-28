import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";

import { DashboardShell } from "@/components/dashboard/shell";
import { authOptions } from "@/lib/auth/auth-options";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) redirect("/login");

  return <DashboardShell>{children}</DashboardShell>;
}
