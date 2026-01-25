"use client";

import * as React from "react";
import { useProfile } from "@/components/profile/profile-provider";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ProfileDialog } from "@/components/profile/profile-dialog";
import { cn } from "@/lib/ui/cn";

interface ProfileButtonProps {
  className?: string;
}

export function ProfileButton({ className }: ProfileButtonProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const { user, profile } = useProfile();

  if (!user) {
    return null;
  }

  const displayName = profile?.name || user.user_metadata?.full_name || user.email;
  const displayAvatar = profile?.avatar_url;

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
            onClose={() => setIsOpen(false)} 
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
