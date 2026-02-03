"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

import { Button } from "@/components/ui/button";

interface PublicHeaderProps {
    currentPath?: string;
}

function EnterSystemButton({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    const router = useRouter();
    const handleEnter = React.useCallback(async () => {
        const supabase = createBrowserClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        const { data } = await supabase.auth.getSession();
        if (data.session) {
            router.push("/app/chat");
        } else {
            router.push("/login");
        }
    }, [router]);

    return (
        <Button
            onClick={handleEnter}
            size="sm"
            className={`rounded-full ${className ?? ""}`}
        >
            {children}
        </Button>
    );
}

export function PublicHeader({ currentPath }: PublicHeaderProps) {
    const isUseCasesActive = currentPath === "/use-cases";

    return (
        <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/30 bg-background/80 backdrop-blur-xl">
            <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
                <Link href="/" className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600">
                        <span className="text-sm font-bold text-white">A</span>
                    </div>
                    <span className="text-lg font-semibold">Assemblr</span>
                </Link>
                <div className="flex items-center gap-6">
                    <Link
                        href="/use-cases"
                        className={`text-sm font-medium transition-colors ${isUseCasesActive
                                ? "text-foreground"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                    >
                        Use Cases
                    </Link>
                    <EnterSystemButton className="h-9 px-4 text-sm">
                        Go to Chat
                    </EnterSystemButton>
                </div>
            </nav>
        </header>
    );
}
