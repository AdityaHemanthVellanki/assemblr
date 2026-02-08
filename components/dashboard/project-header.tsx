"use client";

import * as React from "react";
import { Share, ChevronLeft, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ProfileButton } from "@/components/profile/profile-button";

interface ProjectHeaderProps {
    title: string;
    status: string;
    onShare: () => void;
}

export function ProjectHeader({ title, status, onShare }: ProjectHeaderProps) {
    return (
        <header className="flex h-14 shrink-0 items-center justify-between px-4 border-b border-border bg-background">
            <div className="flex items-center gap-3 overflow-hidden">
                <Link href="/app/chat" className="text-muted-foreground hover:text-foreground transition-colors">
                    <ChevronLeft className="h-5 w-5" />
                </Link>
                <div className="font-semibold text-sm truncate">{title}</div>
            </div>

            <div className="flex items-center gap-2">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                    onClick={onShare}
                >
                    <Share className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                    <MoreHorizontal className="h-4 w-4" />
                </Button>
                {/* <ProfileButton /> */}
                {/* Profile button might be redundant if in Sidebar, but sidebar is Nav. 
                    Let's keep Profile in Sidebar (Shell) and minimal header here. */}
            </div>
        </header>
    );
}
