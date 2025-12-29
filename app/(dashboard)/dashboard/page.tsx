import Link from "next/link";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Shortcuts to core workspace surfaces.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Link href="/dashboard/tools" className="block">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Tools</CardTitle>
              <CardDescription>Create and manage AI-generated tools.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/dashboard/integrations" className="block">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Integrations</CardTitle>
              <CardDescription>Connect data sources and external services.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/dashboard/settings" className="block">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Settings</CardTitle>
              <CardDescription>Workspace configuration and preferences.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </div>
  );
}
