"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
    Bell,
    MessageSquare,
    CreditCard,
    Github,
    Zap,
    Search,
    X,
    ChevronDown,
    ExternalLink,
    Clock,
    LucideIcon,
} from "lucide-react";
import { staggerItem } from "@/lib/ui/motion";

export interface AlertItem {
    id: string | number;
    source: string;
    message: string;
    severity: "critical" | "warning" | "info";
    time: string;
    icon?: LucideIcon;
    link?: string;
    details?: string;
}

const SOURCE_ICONS: Record<string, LucideIcon> = {
    Intercom: MessageSquare,
    Stripe: CreditCard,
    GitHub: Github,
    Linear: Zap,
    Slack: MessageSquare,
};

const SEVERITY_STYLES = {
    critical: {
        color: "text-red-500",
        bg: "bg-red-500/10 border-red-500/20",
        dot: "bg-red-500",
    },
    warning: {
        color: "text-orange-500",
        bg: "bg-orange-500/10 border-orange-500/20",
        dot: "bg-orange-500",
    },
    info: {
        color: "text-blue-500",
        bg: "bg-blue-500/10 border-blue-500/20",
        dot: "bg-blue-500",
    },
};

type SeverityFilter = "all" | "critical" | "warning" | "info";

export function AlertPanel({ alerts }: { alerts: AlertItem[] }) {
    const [search, setSearch] = React.useState("");
    const [severityFilter, setSeverityFilter] = React.useState<SeverityFilter>("all");
    const [dismissedIds, setDismissedIds] = React.useState<Set<string | number>>(new Set());
    const [expandedId, setExpandedId] = React.useState<string | number | null>(null);

    const visibleAlerts = React.useMemo(() => {
        let filtered = alerts.filter((a) => !dismissedIds.has(a.id));

        if (severityFilter !== "all") {
            filtered = filtered.filter((a) => a.severity === severityFilter);
        }

        if (search) {
            const lower = search.toLowerCase();
            filtered = filtered.filter(
                (a) =>
                    a.message.toLowerCase().includes(lower) ||
                    a.source.toLowerCase().includes(lower),
            );
        }

        return filtered;
    }, [alerts, dismissedIds, severityFilter, search]);

    const criticalCount = alerts.filter((a) => a.severity === "critical" && !dismissedIds.has(a.id)).length;
    const activeCount = alerts.filter((a) => !dismissedIds.has(a.id)).length;

    const dismiss = (id: string | number, e: React.MouseEvent) => {
        e.stopPropagation();
        setDismissedIds((prev) => new Set(prev).add(id));
    };

    return (
        <motion.div variants={staggerItem} className="flex-1 flex flex-col min-h-0">
            <Card className="flex-1 bg-white/[0.03] border-white/5 flex flex-col overflow-hidden">
                <CardHeader className="py-3 px-4 border-b border-white/5 bg-white/[0.02] flex items-center justify-between space-y-0">
                    <div className="flex items-center gap-2">
                        <Bell className="w-4 h-4 text-muted-foreground" />
                        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Live Alerts
                        </CardTitle>
                    </div>
                    {criticalCount > 0 && (
                        <motion.div
                            animate={{ scale: [1, 1.1, 1] }}
                            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                            className="flex items-center gap-1.5"
                        >
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                            </span>
                            <span className="text-[10px] text-red-500 font-medium">
                                {criticalCount} Critical
                            </span>
                        </motion.div>
                    )}
                </CardHeader>

                {/* Toolbar */}
                {alerts.length > 3 && (
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
                        <div className="relative flex-1">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search alerts..."
                                className="w-full h-7 pl-7 pr-2 rounded-md bg-white/5 border border-transparent text-[11px] text-white placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/30 transition-all"
                            />
                        </div>
                        <div className="flex items-center bg-white/5 rounded-md overflow-hidden border border-white/5">
                            {(["all", "critical", "warning", "info"] as const).map((sev) => (
                                <button
                                    key={sev}
                                    onClick={() => setSeverityFilter(sev)}
                                    className={`h-7 px-2 text-[10px] uppercase tracking-wider transition-colors ${
                                        severityFilter === sev
                                            ? "bg-white/10 text-white"
                                            : "text-muted-foreground/50 hover:text-white"
                                    }`}
                                    type="button"
                                >
                                    {sev === "all" ? `All (${activeCount})` : sev}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <CardContent className="p-0 overflow-auto flex-1 scrollbar-hide">
                    {visibleAlerts.length === 0 ? (
                        <div className="p-6 text-center text-xs text-muted-foreground">
                            {dismissedIds.size > 0 || severityFilter !== "all" || search
                                ? "No matching alerts."
                                : "No active alerts."}
                        </div>
                    ) : (
                        <div className="divide-y divide-white/5">
                            <AnimatePresence mode="popLayout">
                                {visibleAlerts.map((alert) => {
                                    const Icon = alert.icon || SOURCE_ICONS[alert.source] || Bell;
                                    const style = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.info;
                                    const isExpanded = expandedId === alert.id;

                                    return (
                                        <motion.div
                                            key={alert.id}
                                            layout
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: 10, height: 0 }}
                                            className="relative group/alert cursor-pointer"
                                            onClick={() => setExpandedId(isExpanded ? null : alert.id)}
                                        >
                                            <div className={`p-3 hover:bg-white/5 transition-colors border-l-2 ${
                                                alert.severity === "critical"
                                                    ? "border-l-red-500/50"
                                                    : alert.severity === "warning"
                                                    ? "border-l-orange-500/50"
                                                    : "border-l-transparent"
                                            }`}>
                                                <div className="flex gap-3">
                                                    <div className={`mt-0.5 p-1.5 rounded-md h-fit border ${style.bg}`}>
                                                        <Icon className={`w-3.5 h-3.5 ${style.color}`} />
                                                    </div>
                                                    <div className="flex-1 min-w-0 space-y-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] font-bold text-muted-foreground uppercase">
                                                                {alert.source}
                                                            </span>
                                                            <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                                                            <span className="text-[10px] text-muted-foreground/50 flex items-center gap-0.5">
                                                                <Clock className="w-2.5 h-2.5" />
                                                                {alert.time}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-neutral-300 font-medium leading-relaxed group-hover/alert:text-white transition-colors line-clamp-2">
                                                            {alert.message}
                                                        </p>

                                                        {/* Expanded details */}
                                                        <AnimatePresence>
                                                            {isExpanded && alert.details && (
                                                                <motion.div
                                                                    initial={{ height: 0, opacity: 0 }}
                                                                    animate={{ height: "auto", opacity: 1 }}
                                                                    exit={{ height: 0, opacity: 0 }}
                                                                    className="overflow-hidden"
                                                                >
                                                                    <p className="text-[11px] text-muted-foreground/60 mt-1.5 leading-relaxed">
                                                                        {alert.details}
                                                                    </p>
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>

                                                        {/* Actions row */}
                                                        {isExpanded && (
                                                            <div className="flex items-center gap-2 mt-1.5">
                                                                {alert.link && (
                                                                    <a
                                                                        href={alert.link}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="inline-flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                    >
                                                                        <ExternalLink className="w-3 h-3" />
                                                                        View source
                                                                    </a>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Dismiss button */}
                                                    <button
                                                        onClick={(e) => dismiss(alert.id, e)}
                                                        className="h-5 w-5 rounded-md opacity-0 group-hover/alert:opacity-100 hover:bg-white/10 flex items-center justify-center transition-all shrink-0"
                                                        title="Dismiss"
                                                        type="button"
                                                    >
                                                        <X className="w-3 h-3 text-muted-foreground/50" />
                                                    </button>
                                                </div>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>
                        </div>
                    )}
                </CardContent>

                {/* Footer */}
                {dismissedIds.size > 0 && (
                    <div className="px-4 py-2 border-t border-white/5 flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground/40">
                            {dismissedIds.size} dismissed
                        </span>
                        <button
                            className="text-[10px] text-primary hover:text-primary/80 transition-colors"
                            onClick={() => setDismissedIds(new Set())}
                            type="button"
                        >
                            Restore all
                        </button>
                    </div>
                )}
            </Card>
        </motion.div>
    );
}
