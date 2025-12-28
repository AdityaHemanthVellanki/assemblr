"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();

  async function onSignOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <Button type="button" variant="outline" onClick={onSignOut}>
      Sign out
    </Button>
  );
}
