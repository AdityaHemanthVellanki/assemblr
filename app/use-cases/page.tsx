"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useCases, useCaseCategories } from "@/lib/use-cases/registry";
import { UseCaseCard } from "@/components/use-cases/use-case-card";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/client";

const categoryLabels: Record<string, string> = {
    "Engineering & Product": "Engineering",
    "Revenue, Sales & CRM": "Revenue",
    "Customer Support & Success": "Support",
    "Operations & Finance": "Ops",
    "Executive & Leadership": "Executive",
    "Internal Productivity": "Productivity",
};

const displayCategories = ["All", ...useCaseCategories];

function EnterSystemButton({ children, className }: { children: React.ReactNode; className?: string }) {
    const router = useRouter();
    const handleEnter = React.useCallback(async () => {
        const supabase = createSupabaseClient();
        const { data } = await supabase.auth.getSession();
        if (data.session) {
            router.push("/app/chat");
        } else {
            router.push("/login");
        }
    }, [router]);

    return (
        <Button onClick={handleEnter} size="sm" className={`rounded-full bg-primary text-primary-foreground hover:bg-primary/90 ${className ?? ""}`}>
            {children}
        </Button>
    );
}

export default function PublicUseCasesPage() {
    const [activeCategory, setActiveCategory] = React.useState("All");

    const filteredUseCases = React.useMemo(() => {
        if (activeCategory === "All") {
            return useCases;
        }
        return useCases.filter((uc) => uc.category === activeCategory);
    }, [activeCategory]);

    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Navigation Header */}
            <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
                <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
                    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight transition-opacity hover:opacity-80">
                        <div className="relative h-6 w-6">
                            <Image
                                src="/images/logo-icon.png"
                                alt="Assemblr Logo"
                                fill
                                className="object-contain"
                            />
                        </div>
                        <span>Assemblr</span>
                    </Link>
                    <div className="flex items-center gap-4">
                        <Link
                            href="/use-cases"
                            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                        >
                            Use Cases
                        </Link>
                    </div>
                </div>
            </header>

            {/* Hero Section */}
            <div className="relative border-b border-border/40 pt-32 pb-20">
                <div className="absolute inset-0 bg-grid-white/[0.02] bg-[length:32px_32px]" />
                <div className="absolute inset-0 bg-gradient-to-tr from-background via-background/90 to-background/40" />

                <div className="relative mx-auto max-w-7xl px-6 text-center">
                    <div className="inline-flex items-center rounded-full border border-border/60 bg-muted/30 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur-sm mb-6">
                        <span>Now with {useCases.length}+ Enterprise Integrations</span>
                    </div>
                    <h1 className="text-4xl font-bold tracking-tight sm:text-6xl bg-clip-text text-transparent bg-gradient-to-b from-foreground to-foreground/70">
                        Enterprise Intelligence
                    </h1>
                    <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
                        A complete suite of autonomous agents for Engineering, Sales, Support, and Operations.
                        Ready to deploy in seconds.
                    </p>
                </div>
            </div>

            {/* Category Filters */}
            <div className="sticky top-14 z-40 border-b border-border/40 bg-background/95 backdrop-blur-sm">
                <div className="mx-auto max-w-7xl px-6">
                    <div className="flex items-center gap-2 overflow-x-auto py-3 scrollbar-hide">
                        {displayCategories.map((category) => (
                            <button
                                key={category}
                                onClick={() => setActiveCategory(category)}
                                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${activeCategory === category
                                    ? "bg-foreground text-background shadow-sm"
                                    : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                                    }`}
                            >
                                {category === "All" ? "All Use Cases" : categoryLabels[category] || category}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Use Cases Grid */}
            <div className="mx-auto max-w-7xl px-6 py-12">
                <div className="mb-6 flex items-center justify-between">
                    <h2 className="text-lg font-semibold tracking-tight text-foreground/80">
                        {activeCategory === "All" ? "All Capabilities" : activeCategory}
                    </h2>
                    <span className="text-[10px] font-medium text-muted-foreground bg-muted/30 border border-border/50 rounded-full px-2.5 py-0.5 uppercase tracking-wider">
                        {filteredUseCases.length} items
                    </span>
                </div>

                {filteredUseCases.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/40 p-16 text-center bg-muted/5">
                        <div className="h-8 w-8 text-muted-foreground/30 mb-3">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                            </svg>
                        </div>
                        <p className="text-sm text-muted-foreground font-medium">No results found</p>
                    </div>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                        {filteredUseCases.map((useCase) => (
                            <div key={useCase.id} className="transition-transform duration-200 hover:-translate-y-1">
                                <UseCaseCard
                                    id={useCase.id}
                                    name={useCase.name}
                                    description={useCase.description}
                                    integrations={useCase.integrations}
                                    prompt={useCase.prompt}
                                    category={useCase.category}
                                />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
