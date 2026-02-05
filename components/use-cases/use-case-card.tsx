"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { createSupabaseClient } from "@/lib/supabase/client";

import { IntegrationBadgeRow } from "./integration-badge";
import { Button } from "@/components/ui/button";

export interface UseCaseCardProps {
    id: string;
    name: string;
    description: string;
    integrations: string[];
    prompt: string;
    category: string;
}



export function UseCaseCard({
    id,
    name,
    description,
    integrations,
    prompt,
}: UseCaseCardProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = React.useState(false);

    const handleRun = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const supabase = createSupabaseClient();
            const { data } = await supabase.auth.getSession();

            const params = new URLSearchParams();
            params.set("prompt", prompt);
            params.set("integrations", integrations.join(","));
            params.set("useCaseId", id);

            if (data.session) {
                // User is logged in - go directly to chat
                router.push(`/app/chat?${params.toString()}`);
            } else {
                // User not logged in - store intent and redirect to login
                if (typeof window !== "undefined") {
                    sessionStorage.setItem("assemblr_pending_usecase", JSON.stringify({
                        id,
                        prompt,
                        integrations,
                    }));
                }
                const returnTo = encodeURIComponent(`/app/chat?${params.toString()}`);
                router.push(`/login?returnTo=${returnTo}`);
            }
        } catch (error) {
            console.error("Failed to check auth status:", error);
            // Fallback to login
            router.push("/login");
        } finally {
            setIsLoading(false);
        }
    }, [router, id, prompt, integrations]);

    return (
        <div className="group relative flex flex-col rounded-2xl border border-border/60 bg-background/40 p-5 backdrop-blur-sm transition-all duration-200 hover:border-primary/40 hover:shadow-[0_16px_40px_rgba(8,10,25,0.35)]">
            {/* Integration badges */}
            <div className="mb-3">
                <IntegrationBadgeRow integrations={integrations} />
            </div>

            {/* Title */}
            <h3 className="text-base font-semibold text-foreground/90 leading-tight">
                {name}
            </h3>

            {/* Description */}
            <p className="mt-2 flex-1 text-sm text-muted-foreground line-clamp-2">
                {description}
            </p>

            {/* Footer with run count and action */}
            <div className="mt-4 flex items-center justify-end">
                <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-3 text-xs font-medium text-foreground/80 hover:text-foreground hover:bg-muted/50"
                    onClick={handleRun}
                    disabled={isLoading}
                >
                    {isLoading ? "Loading..." : "Run now →"}
                </Button>
            </div>
        </div>
    );
}
