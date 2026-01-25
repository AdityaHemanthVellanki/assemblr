"use client";

import * as React from "react";
import { createSupabaseClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface Profile {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
}

interface ProfileContextType {
  user: any | null; // Full auth user object
  profile: Profile | null;
  isLoading: boolean;
  setProfile: (profile: Profile | null) => void;
  refreshProfile: () => Promise<void>;
}

const ProfileContext = React.createContext<ProfileContextType | undefined>(undefined);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<any | null>(null);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const supabase = createSupabaseClient();
  const router = useRouter();

  const refreshProfile = React.useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setUser(null);
        setProfile(null);
        setIsLoading(false);
        return;
      }
      
      setUser(user);

      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, avatar_url")
        .eq("id", user.id)
        .single();

      if (error && error.code !== "PGRST116") {
        console.error("Failed to fetch profile", error);
      }

      setProfile({
        id: user.id,
        email: user.email || null,
        name: data?.name || null,
        avatar_url: data?.avatar_url || null,
      });
    } catch (err) {
      console.error("Error refreshing profile", err);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  React.useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const value = React.useMemo(() => ({
    user,
    profile,
    isLoading,
    setProfile,
    refreshProfile
  }), [user, profile, isLoading, setProfile, refreshProfile]);

  return (
    <ProfileContext.Provider value={value}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const context = React.useContext(ProfileContext);
  if (context === undefined) {
    throw new Error("useProfile must be used within a ProfileProvider");
  }
  return context;
}
