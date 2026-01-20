"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { safeFetch } from "@/lib/api/client";

export function SignOutButton() {
  const router = useRouter();

  async function onSignOut() {
    try {
      await safeFetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error("Failed to sign out", err);
    }
  }

  return (
    <Button type="button" variant="outline" onClick={onSignOut}>
      Sign out
    </Button>
  );
}
