"use client";

import * as React from "react";

const INTEGRATION_ICONS: Record<string, { icon: React.ReactNode; bg: string; label: string }> = {
    google: {
        label: "Google",
        bg: "bg-white",
        icon: (
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
        ),
    },
    github: {
        label: "GitHub",
        bg: "bg-[#24292f]",
        icon: (
            <svg viewBox="0 0 24 24" fill="white" className="h-3.5 w-3.5">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
        ),
    },
    slack: {
        label: "Slack",
        bg: "bg-[#4A154B]",
        icon: (
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5">
                <path fill="#E01E5A" d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" />
                <path fill="#36C5F0" d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" />
                <path fill="#2EB67D" d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z" />
                <path fill="#ECB22E" d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
            </svg>
        ),
    },
    notion: {
        label: "Notion",
        bg: "bg-white",
        icon: (
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5">
                <path fill="#000" d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.98-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466l1.823 1.447zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.934-.56.934-1.167V6.354c0-.606-.233-.933-.746-.886l-15.177.887c-.56.047-.748.327-.748.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952l1.448.327s0 .84-1.168.84l-3.22.186c-.094-.187 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.514.28-.886.747-.933l3.222-.187zM2.1.667l13.449-.933c1.635-.14 2.055-.047 3.082.7l4.251 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747L.935 19.061c-.56-.747-.793-1.306-.793-1.96V2.667C.142 1.64.609.76 2.1.667z" />
            </svg>
        ),
    },
    linear: {
        label: "Linear",
        bg: "bg-[#5E6AD2]",
        icon: (
            <svg viewBox="0 0 24 24" fill="white" className="h-3.5 w-3.5">
                <path d="M3.005 12.134a.997.997 0 0 1 .292-.705L11.43 3.296a.997.997 0 0 1 1.41 0l8.132 8.133a.997.997 0 0 1 0 1.41l-8.133 8.133a.997.997 0 0 1-1.41 0L3.298 12.84a.997.997 0 0 1-.293-.706zm2.118 0 6.014 6.013 6.013-6.013-6.013-6.014-6.014 6.014z" />
            </svg>
        ),
    },
};

interface IntegrationBadgeProps {
    integrationId: string;
    showLabel?: boolean;
    size?: "sm" | "md";
}

export function IntegrationBadge({ integrationId, showLabel = false, size = "sm" }: IntegrationBadgeProps) {
    const config = INTEGRATION_ICONS[integrationId];
    if (!config) return null;

    const sizeClasses = size === "sm" ? "h-6 w-6" : "h-8 w-8";

    return (
        <div className="flex items-center gap-1.5">
            <div
                className={`${sizeClasses} flex items-center justify-center rounded-md ${config.bg} shadow-sm`}
                title={config.label}
            >
                {config.icon}
            </div>
            {showLabel && (
                <span className="text-xs text-muted-foreground">{config.label}</span>
            )}
        </div>
    );
}

interface IntegrationBadgeRowProps {
    integrations: string[];
    max?: number;
}

export function IntegrationBadgeRow({ integrations, max = 4 }: IntegrationBadgeRowProps) {
    const displayIntegrations = integrations.slice(0, max);
    const remaining = integrations.length - max;

    return (
        <div className="flex items-center gap-1">
            {displayIntegrations.map((id) => (
                <IntegrationBadge key={id} integrationId={id} />
            ))}
            {remaining > 0 && (
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-[10px] font-medium text-muted-foreground">
                    +{remaining}
                </span>
            )}
        </div>
    );
}
