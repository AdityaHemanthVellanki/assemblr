"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { safeFetch } from "@/lib/api/client";

export function NewProjectButton({
  label = "New Project",
}: {
  label?: string;
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function onClick() {
    router.push("/app/chat");
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" onClick={onClick} disabled={isLoading}>
        <Plus />
        {label}
      </Button>
      {error ? (
        <div className="text-sm text-muted-foreground">{error}</div>
      ) : null}
    </div>
  );
}
