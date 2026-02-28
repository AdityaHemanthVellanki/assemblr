"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  LogOut,
  Camera,
  Loader2,
  Check,
  User,
  Mail,
  Shield,
  Clock,
} from "lucide-react";

import { createSupabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProfile } from "@/components/profile/profile-provider";
import { cn } from "@/lib/ui/cn";
import { fadeUp, staggerContainer, staggerItem } from "@/lib/ui/motion";

export default function SettingsPage() {
  const router = useRouter();
  const { user, profile, setProfile } = useProfile();

  const [isSaving, setIsSaving] = React.useState(false);
  const [isSigningOut, setIsSigningOut] = React.useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = React.useState(false);

  const [name, setName] = React.useState("");
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null);
  const [imageError, setImageError] = React.useState(false);
  const [message, setMessage] = React.useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const supabase = createSupabaseClient();

  // Sync form from profile context
  React.useEffect(() => {
    if (profile) {
      setName(profile.name || "");
      setAvatarUrl(profile.avatar_url || null);
    } else if (user) {
      setName(user.user_metadata?.full_name || "");
      setAvatarUrl(user.user_metadata?.avatar_url || null);
    }
  }, [profile, user]);

  const handleSave = async () => {
    if (isSaving || isUploadingAvatar) return;
    if (!user?.id) return;

    setIsSaving(true);
    setMessage(null);

    try {
      const payload = {
        id: user.id,
        name: name?.trim() || null,
        avatar_url: avatarUrl || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("profiles")
        .upsert(payload, { onConflict: "id" });

      if (error) throw error;

      await supabase.auth.updateUser({
        data: {
          full_name: payload.name,
          avatar_url: payload.avatar_url || undefined,
        },
      });

      setProfile({
        id: user.id,
        email: user.email || null,
        name: payload.name,
        avatar_url: payload.avatar_url,
      });

      setMessage({ type: "success", text: "Profile updated successfully" });
      router.refresh();
    } catch (err: any) {
      console.error("Failed to save profile", err);
      setMessage({
        type: "error",
        text: err?.message || "Failed to save profile",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (!e.target.files || e.target.files.length === 0 || !user?.id) return;

    const file = e.target.files[0];
    const fileExt = file.name.split(".").pop();
    const filePath = `${user.id}/${Date.now()}.${fileExt}`;

    setIsUploadingAvatar(true);
    setMessage(null);

    try {
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);

      setAvatarUrl(data.publicUrl);
      setImageError(false);
      setMessage({
        type: "success",
        text: "Avatar uploaded. Click Save to apply.",
      });
    } catch (err: any) {
      console.error("Avatar upload failed", err);
      if (err.message?.includes("Bucket not found")) {
        setMessage({
          type: "error",
          text: "System error: avatars storage bucket missing.",
        });
      } else {
        setMessage({
          type: "error",
          text: "Couldn't upload profile picture. Please try again.",
        });
      }
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await supabase.auth.signOut();
    setProfile(null);
    router.refresh();
    router.push("/");
  };

  if (!user) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const provider = user.app_metadata?.provider || "email";
  const createdAt = user.created_at
    ? new Intl.DateTimeFormat("en", {
        dateStyle: "long",
      }).format(new Date(user.created_at))
    : null;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-6 py-8">
      {/* Page Header */}
      <motion.div
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        className="space-y-2"
      >
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your profile and account preferences
        </p>
      </motion.div>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="space-y-6"
      >
        {/* Profile Section */}
        <motion.div
          variants={staggerItem}
          className="rounded-2xl border border-border/60 bg-background/40 p-6 backdrop-blur-sm"
        >
          <h2 className="mb-6 text-lg font-semibold">Profile</h2>

          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            {/* Avatar */}
            <div className="group relative shrink-0">
              <div className="h-24 w-24 overflow-hidden rounded-2xl border-2 border-border/60 bg-muted transition-colors group-hover:border-primary/40">
                {avatarUrl && !imageError ? (
                  <Image
                    src={avatarUrl}
                    alt={name || "User"}
                    width={96}
                    height={96}
                    className="h-full w-full object-cover"
                    onError={() => setImageError(true)}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-muted text-2xl font-semibold text-muted-foreground">
                    {name
                      ? name[0]?.toUpperCase()
                      : user.email?.[0]?.toUpperCase() || "U"}
                  </div>
                )}
              </div>
              <label
                htmlFor="avatar-upload-settings"
                className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-2xl bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                {isUploadingAvatar ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Camera className="h-5 w-5" />
                )}
              </label>
              <input
                id="avatar-upload-settings"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
                disabled={isSaving || isUploadingAvatar}
              />
            </div>

            {/* Form Fields */}
            <div className="flex-1 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="display-name" className="text-sm font-medium">
                  Display Name
                </Label>
                <Input
                  id="display-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  disabled={isSaving}
                  className="bg-muted/30"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Email</Label>
                <div className="flex h-10 items-center rounded-md border border-input bg-muted/20 px-3 text-sm text-muted-foreground">
                  {user.email}
                </div>
              </div>
            </div>
          </div>

          {/* Feedback Message */}
          {message && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "mt-4 rounded-lg p-3 text-sm",
                message.type === "success"
                  ? "bg-emerald-500/10 text-emerald-500"
                  : "bg-red-500/10 text-red-500",
              )}
            >
              <div className="flex items-center gap-2">
                {message.type === "success" ? (
                  <Check className="h-4 w-4" />
                ) : null}
                {message.text}
              </div>
            </motion.div>
          )}

          {/* Save Button */}
          <div className="mt-6 flex justify-end">
            <Button
              onClick={handleSave}
              disabled={isSaving || isUploadingAvatar}
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </div>
        </motion.div>

        {/* Account Info Section */}
        <motion.div
          variants={staggerItem}
          className="rounded-2xl border border-border/60 bg-background/40 p-6 backdrop-blur-sm"
        >
          <h2 className="mb-4 text-lg font-semibold">Account</h2>

          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-lg p-3 text-sm">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                <Mail className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <div className="font-medium">Email</div>
                <div className="text-muted-foreground">{user.email}</div>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-lg p-3 text-sm">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                <Shield className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <div className="font-medium">Sign-in Method</div>
                <div className="capitalize text-muted-foreground">
                  {provider}
                </div>
              </div>
            </div>

            {createdAt && (
              <div className="flex items-center gap-3 rounded-lg p-3 text-sm">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <div className="font-medium">Member Since</div>
                  <div className="text-muted-foreground">{createdAt}</div>
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* Sign Out Section */}
        <motion.div
          variants={staggerItem}
          className="rounded-2xl border border-red-500/10 bg-background/40 p-6 backdrop-blur-sm"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Sign Out</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Sign out of your account on this device
              </p>
            </div>
            <Button
              variant="outline"
              onClick={handleSignOut}
              disabled={isSigningOut || isSaving}
              className="border-red-500/20 text-red-500 hover:bg-red-500/10 hover:text-red-400"
            >
              {isSigningOut ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="mr-2 h-4 w-4" />
              )}
              Sign Out
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
