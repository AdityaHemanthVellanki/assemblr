"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { LogOut, User, Camera, Loader2, Check } from "lucide-react";
import { createSupabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/ui/cn";

interface ProfileDialogProps {
  user: {
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
  };
  profile: {
    name?: string | null;
    avatar_url?: string | null;
  } | null;
  onClose: () => void;
}

export function ProfileDialog({ user, profile, onClose }: ProfileDialogProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = React.useState(false);
  const [name, setName] = React.useState(profile?.name || user.user_metadata?.full_name || "");
  const [sharedCount, setSharedCount] = React.useState<number | null>(null);
  const [avatarUrl, setAvatarUrl] = React.useState(profile?.avatar_url || user.user_metadata?.avatar_url || null);
  const [message, setMessage] = React.useState<{ type: "success" | "error"; text: string } | null>(null);
  const [imageError, setImageError] = React.useState(false);

  const supabase = createSupabaseClient();

  React.useEffect(() => {
    // Fetch shared tools count
    async function fetchSharedCount() {
      try {
        const { count, error } = await supabase
          .from("tool_shares")
          .select("*", { count: "exact", head: true })
          .eq("created_by", user.id);
        
        if (!error) {
          setSharedCount(count);
        }
      } catch (err) {
        console.error("Failed to fetch shared count", err);
      }
    }
    fetchSharedCount();
  }, [user.id, supabase]);

  const handleSignOut = async () => {
    setIsLoading(true);
    await supabase.auth.signOut();
    router.refresh();
    router.push("/");
  };

  const handleSave = async () => {
    if (isSaving) return;
    if (isUploadingAvatar) {
      setMessage({ type: "error", text: "Please wait for the avatar upload to finish." });
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      // 0. Verify Auth
      const { 
        data: { user: currentUser }, 
        error: userError 
      } = await supabase.auth.getUser();

      if (userError || !currentUser || !currentUser.id) {
        throw new Error("Cannot save profile: user.id is missing or user not authenticated");
      }

      // 1. Normalize Payload
      const payload = {
        id: currentUser.id,
        name: name?.trim() || null,
        avatar_url: avatarUrl || null,
        updated_at: new Date().toISOString(),
      };

      console.log("Saving profile payload:", payload);

      // 2. Update Profile Table
      // Using upsert with explicit onConflict to handle both creation and updates safely
      const { error } = await supabase
        .from("profiles")
        .upsert(payload, { onConflict: "id" });

      if (error) {
        console.error("Supabase upsert error:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
          raw: error
        });
        throw error;
      }

      console.log("Save successful for user:", currentUser.id);

      // 3. Update Auth User Metadata (optional but good for consistency)
      const { error: metadataError } = await supabase.auth.updateUser({
        data: { full_name: payload.name, avatar_url: payload.avatar_url || undefined }
      });

      if (metadataError) {
        console.error("Auth metadata update error:", metadataError);
      }

      setMessage({ type: "success", text: "Profile updated" });
      
      // 4. Sync State & UI
      router.refresh(); 
      // Note: We don't close the dialog automatically to allow user to see success message
    } catch (err: any) {
      console.error("Failed to save profile", err);
      
      const errorMessage = err?.message || "Failed to save profile";
      setMessage({ type: "error", text: errorMessage });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const file = e.target.files[0];
    const fileExt = file.name.split('.').pop();
    // Deterministic path with timestamp to avoid caching issues
    const filePath = `${user.id}/${Date.now()}.${fileExt}`;

    setIsUploadingAvatar(true); // Show loading state during upload
    setMessage(null);

    try {
      // 1. Upload to 'avatars' bucket
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        throw uploadError;
      }

      // 2. Get Public URL
      const { data } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);
        
      setAvatarUrl(data.publicUrl);
      setImageError(false);
      setMessage({ type: "success", text: "Avatar uploaded. Don't forget to save." });
    } catch (err: any) {
      console.error("Avatar upload failed", err);
      // specific error handling
      if (err.message?.includes("Bucket not found") || err.error === "Bucket not found") {
        setMessage({ type: "error", text: "System Error: 'avatars' storage bucket missing." });
      } else if (err.message?.includes("row-level security") || err.code === "42501") {
        setMessage({ type: "error", text: "Permission denied. You cannot upload here." });
      } else {
        setMessage({ type: "error", text: "Couldn't upload profile picture. Please try again." });
      }
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  return (
    <div className="space-y-6">
      <DialogHeader>
        <DialogTitle>Account & Settings</DialogTitle>
      </DialogHeader>

      <div className="flex items-start gap-4">
        <div className="relative group">
          <div className="h-16 w-16 overflow-hidden rounded-full border border-border bg-muted">
            {avatarUrl && !imageError ? (
              <Image
                src={avatarUrl}
                alt={name || "User"}
                width={64}
                height={64}
                className="h-full w-full object-cover"
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-muted text-lg font-medium text-muted-foreground">
                {name ? name[0]?.toUpperCase() : (user.email?.[0]?.toUpperCase() || "U")}
              </div>
            )}
          </div>
          <label 
            htmlFor="avatar-upload" 
            className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 cursor-pointer rounded-full"
          >
            <Camera className="h-5 w-5" />
          </label>
          <input 
            id="avatar-upload" 
            type="file" 
            accept="image/*" 
            className="hidden" 
            onChange={handleAvatarUpload}
            disabled={isSaving || isUploadingAvatar}
          />
        </div>

        <div className="flex-1 space-y-1">
          <div className="font-medium">{user.email}</div>
          <div className="text-xs text-muted-foreground capitalize">
            Signed in with {user.app_metadata?.provider || "email"}
          </div>
          {sharedCount !== null && sharedCount > 0 && (
             <div className="text-xs text-blue-400 pt-1">
               You’ve shared {sharedCount} tools publicly
             </div>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="display-name">Display Name</Label>
          <Input 
            id="display-name" 
            value={name} 
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            disabled={isSaving}
          />
        </div>
      </div>

      {message && (
        <div className={cn(
          "text-sm p-2 rounded-md", 
          message.type === "success" ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
        )}>
          {message.text}
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <Button 
          variant="outline" 
          onClick={handleSignOut} 
          disabled={isLoading || isSaving}
          className="text-muted-foreground hover:text-foreground"
        >
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
          Sign out
        </Button>
        <Button onClick={handleSave} disabled={isSaving || isUploadingAvatar}>
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (isUploadingAvatar ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Save Changes")}
        </Button>
      </div>
    </div>
  );
}
