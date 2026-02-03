"use client";

import * as React from "react";
import Link from "next/link";
import { useCases, useCaseCategories } from "@/lib/use-cases/registry";
import { UseCaseCard } from "@/components/use-cases/use-case-card";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

// Simulated run counts (in production, would come from analytics)
const generateRunCount = (id: string): number => {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
    }
    return Math.abs(hash % 5000) + 200;
};

const categoryLabels: Record<string, string> = {
    "Featured": "Featured",
    "Engineering": "Engineering",
    "Design": "Design",
    "Marketing": "Marketing",
    "Sales": "Sales",
    "Operations": "Ops",
    "Leadership / Exec": "Enterprise",
    "Personal (Consumer)": "Personal",
};

const displayCategories = ["All", ...useCaseCategories.map(c => categoryLabels[c] || c)];

function EnterSystemButton({ children, className }: { children: React.ReactNode; className?: string }) {
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
        <Button onClick={handleEnter} size="sm" className={`rounded-full ${className ?? ""}`}>
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
        const originalCategory = Object.entries(categoryLabels).find(
            ([, label]) => label === activeCategory
        )?.[0] ?? activeCategory;
        return useCases.filter((uc) => uc.category === originalCategory);
    }, [activeCategory]);

    return (
        <div className="dark min-h-screen bg-background text-foreground">
            {/* Navigation Header */}
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
                            className="text-sm font-medium text-foreground"
                        >
                            Use Cases
                        </Link>
                        <EnterSystemButton className="h-9 px-4 text-sm">
                            Go to Chat
                        </EnterSystemButton>
                    </div>
                </nav>
            </header>

            {/* Hero Section */}
            <div className="relative overflow-hidden border-b border-border/40 bg-gradient-to-b from-muted/20 to-background pt-20">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(30,41,59,0.4),_transparent_70%)]" />
                <div className="relative mx-auto max-w-7xl px-6 py-16 text-center">
                    <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                        Use Cases
                    </h1>
                    <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
                        Ready-to-run intelligent tools built for real work. Click to start using them instantly.
                    </p>
                </div>
            </div>

            {/* Category Filters */}
            <div className="sticky top-[73px] z-40 border-b border-border/40 bg-background/95 backdrop-blur-sm">
                <div className="mx-auto max-w-7xl px-6">
                    <div className="flex items-center gap-1 overflow-x-auto py-4 scrollbar-hide">
                        {displayCategories.map((category) => (
                            <button
                                key={category}
                                onClick={() => setActiveCategory(category)}
                                className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${activeCategory === category
                                        ? "bg-foreground text-background"
                                        : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                                    }`}
                            >
                                {category}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Use Cases Grid */}
            <div className="mx-auto max-w-7xl px-6 py-10">
                <div className="mb-6 flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                        {filteredUseCases.length} tool{filteredUseCases.length !== 1 ? "s" : ""}
                    </span>
                </div>

                {filteredUseCases.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border/60 p-12 text-center">
                        <p className="text-muted-foreground">No tools found in this category.</p>
                    </div>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {filteredUseCases.map((useCase) => (
                            <UseCaseCard
                                key={useCase.id}
                                id={useCase.id}
                                name={useCase.name}
                                description={useCase.description}
                                integrations={useCase.integrations}
                                prompt={useCase.prompt}
                                category={useCase.category}
                                runCount={generateRunCount(useCase.id)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
