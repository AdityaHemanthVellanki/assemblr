"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createSupabaseClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const supabase = createSupabaseClient();

  async function onSignOut() {
    try {
      await supabase.auth.signOut();
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
