"use client";

import * as React from "react";
import { createBrowserClient } from "@supabase/ssr";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ProfileDialog } from "@/components/profile/profile-dialog";
import { cn } from "@/lib/ui/cn";

interface ProfileButtonProps {
  initialUser?: {
    id: string;
    email?: string | null;
    user_metadata?: {
      avatar_url?: string;
      full_name?: string;
    };
    app_metadata?: {
      provider?: string;
      [key: string]: any;
    };
  } | null;
  initialProfile?: {
    name?: string | null;
    avatar_url?: string | null;
  } | null;
  className?: string;
}

export function ProfileButton({ initialUser, initialProfile, className }: ProfileButtonProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [user, setUser] = React.useState(initialUser || null);
  const [profile, setProfile] = React.useState(initialProfile || null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // If no initial data, fetch on mount (fallback)
  React.useEffect(() => {
    if (!initialUser) {
      const fetchUser = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUser(user);
          const { data: profile } = await supabase
            .from("profiles")
            .select("name, avatar_url")
            .eq("id", user.id)
            .single();
          setProfile(profile);
        }
      };
      fetchUser();
    }
  }, [initialUser, supabase]);

  // Subscribe to profile changes for real-time updates (optional but nice)
  React.useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`profile:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          setProfile(payload.new as any);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, supabase]);

  if (!user) {
    // If loading or not logged in, render nothing or a placeholder?
    // For shared views, if not logged in, we shouldn't show profile button?
    // Or show "Sign In"?
    // User requirement: "If user has shared tools...". Implies logged in.
    // "Landing page behavior... If unauthenticated -> redirect to Google OAuth login"
    // So usually we are logged in.
    return null;
  }

  const displayName = profile?.name || user.user_metadata?.full_name || user.email;
  const displayAvatar = profile?.avatar_url || user.user_metadata?.avatar_url;

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          "relative flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted transition-all hover:ring-2 hover:ring-ring hover:ring-offset-2 hover:ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          className
        )}
      >
        {displayAvatar ? (
          <img
            src={displayAvatar}
            alt={displayName || "User"}
            className="h-full w-full rounded-full object-cover"
          />
        ) : (
          <span className="text-xs font-medium text-muted-foreground">
            {displayName ? displayName[0]?.toUpperCase() : "U"}
          </span>
        )}
      </button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <ProfileDialog 
            user={user} 
            profile={profile} 
            onClose={() => setIsOpen(false)} 
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
