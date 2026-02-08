"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sendChatMessage } from "@/app/actions/chat";
import { toast } from "sonner";
import { Loader2, ArrowRight } from "lucide-react";

export function ChatLauncherClient() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const promptParam = searchParams.get("prompt");
    const integrationsParam = searchParams.get("integrations");

    // Auto-execution state
    const [isAutoLaunching, setIsAutoLaunching] = React.useState(false);
    const hasLaunchedRef = React.useRef(false);
    const [input, setInput] = React.useState("");

    const handleCreateTool = async (message: string, attachments: File[]) => {
        try {
            const result = await sendChatMessage(
                undefined, // No toolId yet -> Create new
                message,
                [], // No history
                null // No spec
            );

            if (result.error) {
                toast.error(result.error);
                return;
            }

            if (result.toolId) {
                toast.success("Tool created! Redirecting...");
                router.push(`/dashboard/projects/${result.toolId}`);
            }
        } catch (error) {
            console.error("Failed to create tool:", error);
            toast.error("Failed to start tool. Please try again.");
        } finally {
            setIsAutoLaunching(false);
        }
    };

    const handleSubmit = () => {
        if (!input.trim()) return;
        setIsAutoLaunching(true);
        handleCreateTool(input, []);
    };

    // Handle auto-launch from query params (e.g. coming from Use Cases)
    React.useEffect(() => {
        if (promptParam && !hasLaunchedRef.current) {
            hasLaunchedRef.current = true;
            setIsAutoLaunching(true);
            toast.info("Initializing use case...");

            // Short delay to ensure hydration/toast visibility
            setTimeout(() => {
                handleCreateTool(promptParam, []);
            }, 500);
        }
    }, [promptParam, integrationsParam]);

    if (isAutoLaunching) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-background">
                <div className="flex flex-col items-center gap-4 max-w-md text-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <h2 className="text-xl font-semibold">Setting up your workspace...</h2>
                    <p className="text-sm text-muted-foreground">
                        We are initializing the requested use case and setting up the environment.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center h-screen bg-background p-4">
            <div className="w-full max-w-2xl space-y-8 animate-in fade-in zoom-in duration-500">
                <div className="text-center space-y-2">
                    <h1 className="text-3xl font-bold tracking-tight">What do you want to build?</h1>
                    <p className="text-muted-foreground">
                        Describe a tool or workflow, and Assemblr will build it for you.
                    </p>
                </div>

                <div className="relative group">
                    <div className="relative rounded-xl border border-border bg-background shadow-sm focus-within:ring-2 focus-within:ring-primary/20 transition-all overflow-hidden">
                        <Textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="e.g. Analyze GitHub PRs and Linear cycles for the last sprint..."
                            className="min-h-[80px] w-full resize-none border-0 bg-transparent px-4 py-3 text-sm focus-visible:ring-0 placeholder:text-muted-foreground/50"
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSubmit();
                                }
                            }}
                        />
                        <div className="flex justify-end px-2 py-2 bg-muted/20 border-t border-border/40">
                            <Button size="sm" onClick={handleSubmit} disabled={!input.trim()}>
                                Start Building <ArrowRight className="w-4 h-4 ml-1" />
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="p-4 rounded-xl bg-muted/30 border border-border/40">
                        <div className="font-medium text-sm mb-1">Engineering</div>
                        <div className="text-xs text-muted-foreground">Release Radar, Sprint Retro</div>
                    </div>
                    <div className="p-4 rounded-xl bg-muted/30 border border-border/40">
                        <div className="font-medium text-sm mb-1">Product</div>
                        <div className="text-xs text-muted-foreground">Feature Adoption, ROI</div>
                    </div>
                    <div className="p-4 rounded-xl bg-muted/30 border border-border/40">
                        <div className="font-medium text-sm mb-1">Support</div>
                        <div className="text-xs text-muted-foreground">Ticket Triage, SLA Breach</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
