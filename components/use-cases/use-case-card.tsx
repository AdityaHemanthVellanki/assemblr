"use client";

import * as React from "react";
import { IntegrationBadgeRow } from "./integration-badge";

export interface UseCaseCardProps {
    id: string;
    name: string;
    description: string;
    integrations: string[];
    prompt: string;
    category: string;
}



export function UseCaseCard({
    name,
    description,
    integrations,
}: UseCaseCardProps) {
    return (
        <div className="relative flex flex-col rounded-xl border border-border/50 bg-background/50 p-4 transition-all duration-300">
            {/* Header: Name */}
            <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="text-sm font-semibold text-foreground/90 leading-snug line-clamp-2">
                    {name}
                </h3>
            </div>

            {/* Description */}
            <p className="text-xs text-muted-foreground line-clamp-2 mb-3 leading-relaxed">
                {description}
            </p>

            {/* Footer: Integrations */}
            <div className="mt-auto pt-2 border-t border-border/30">
                <IntegrationBadgeRow integrations={integrations} shrink={true} />
            </div>
        </div>
    );
}
