import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ProfileProvider } from "@/components/profile/profile-provider";

export const dynamic = "force-dynamic";

/**
 * Onboarding layout — minimal chrome, no sidebar.
 * Full-screen immersive experience for first-time users.
 */
export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  return (
    <ProfileProvider>
      <div className="dark min-h-screen bg-background text-foreground">
        {children}
      </div>
    </ProfileProvider>
  );
}
