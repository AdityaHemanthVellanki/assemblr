"use client";

import * as React from "react";
import { m } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { joinWaitlistAction } from "@/app/actions/waitlist";

export function WaitlistForm() {
    const [email, setEmail] = React.useState("");
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [isSuccess, setIsSuccess] = React.useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !email.includes("@")) {
            toast.error("Please enter a valid email address");
            return;
        }

        setIsSubmitting(true);

        try {
            const result = await joinWaitlistAction(email);

            if (result.error) {
                toast.error(result.error);
                return;
            }

            setIsSuccess(true);
            toast.success("You've been added to the waitlist!");
        } catch (error) {
            console.error("Waitlist submission failed:", error);
            toast.error("An unexpected error occurred.");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isSuccess) {
        return (
            <m.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-primary/5 border border-primary/20 backdrop-blur-sm"
            >
                <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                    <CheckCircle2 className="h-6 w-6" />
                </div>
                <div className="text-center">
                    <h3 className="font-semibold text-foreground">You're on the list!</h3>
                    <p className="text-sm text-muted-foreground">We'll reach out when we're ready for you.</p>
                </div>
            </m.div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="relative w-full max-w-md mx-auto">
            <div className="flex flex-col sm:flex-row items-center gap-3 p-1 rounded-[2rem] sm:rounded-full bg-muted/30 border border-border/40 backdrop-blur-md focus-within:border-primary/40 transition-all shadow-xl shadow-black/5">
                <Input
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-12 px-6 rounded-full text-base placeholder:text-muted-foreground/50"
                    disabled={isSubmitting}
                />
                <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full sm:w-auto rounded-full h-10 px-8 bg-primary text-primary-foreground hover:bg-primary/90 font-medium transition-all group shrink-0"
                >
                    {isSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <>
                            Join Waitlist
                            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </>
                    )}
                </Button>
            </div>
        </form>
    );
}
