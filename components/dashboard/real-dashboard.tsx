"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar,
    ComposedChart
} from "recharts";
import {
    Activity,
    CreditCard,
    Users,
    ShieldAlert,
    MessageSquare,
    GitPullRequest,
} from "lucide-react";
import { KpiCard } from "./widgets/kpi-card";
import { ChartCard } from "./widgets/chart-card";
import { AlertPanel } from "./widgets/alert-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

// --- Types ---
interface DashboardSpec {
    title?: string;
    description?: string;
    layout?: "grid" | "list";
    components: DashboardComponent[];
}

interface DashboardComponent {
    id: string;
    type: "kpi" | "LineChart" | "BarChart" | "AlertBanner" | "Table" | string;
    label: string;
    span?: number; // col-span

    // For KPI
    value?: string | number;
    trend?: string;
    status?: "healthy" | "warning" | "critical" | "on-track";

    // For Charts/Tables
    dataKey?: string;
    xAxis?: string;
    yAxis?: string;
}

interface RealDashboardProps {
    spec: DashboardSpec;
    data: any;
}

const containerVariants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.05,
        },
    },
};

const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0 },
};

const KPI_ICONS: Record<string, any> = {
    "Engineering Health": Activity,
    "Revenue Risk": CreditCard,
    "Customer Health": Users,
    "Release Readiness": GitPullRequest,
    "Support Load": MessageSquare,
    "Churn Signals": ShieldAlert
};

export function RealDashboard({ spec, data }: RealDashboardProps) {
    if (!spec || !spec.components) return null;

    return (
        <div className="flex h-full flex-col bg-[#09090b] text-foreground font-sans overflow-hidden">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between border-b border-white/10 px-6 py-3 bg-[#09090b]/95 backdrop-blur-md sticky top-0 z-20"
            >
                <div className="flex items-center gap-4">
                    <div className="bg-primary/20 p-2 rounded-lg">
                        <Activity className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-lg font-bold tracking-tight text-white">{spec.title || "Dashboard"}</h1>
                            <Badge variant="outline" className="border-green-500/40 bg-green-500/10 text-green-400 font-mono text-[10px] uppercase tracking-wider h-5 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                                LIVE
                            </Badge>
                        </div>
                        {spec.description && (
                            <p className="text-xs text-muted-foreground/80">
                                {spec.description}
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <Button size="sm" variant="outline" className="h-8 gap-2 border-white/10 bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-white transition-colors">
                        <RefreshCw className="w-3.5 h-3.5" />
                        Refresh
                    </Button>
                </div>
            </motion.div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-none p-6">
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                    className="max-w-[1800px] mx-auto space-y-6"
                >
                    {/* Render Components Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {spec.components.map((comp) => (
                            <motion.div
                                variants={itemVariants}
                                key={comp.id}
                                className={`col-span-1 md:col-span-${Math.min(comp.span || 1, 2)} lg:col-span-${comp.span || 1}`}
                            >
                                <RenderComponent component={comp} data={data} />
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            </div>
        </div>
    );
}

function RenderComponent({ component, data }: { component: DashboardComponent; data: any }) {
    const { type, label, dataKey, xAxis, yAxis, value, trend, status } = component;

    if (type === "kpi") {
        const Icon = KPI_ICONS[label] || Activity;
        let trendColor = "text-muted-foreground";
        if (trend) {
            if (trend.startsWith("+")) trendColor = "text-green-400";
            if (trend.startsWith("-")) trendColor = "text-red-400";
        }

        // Custom logic for risk/churn being reverse bad
        if (label.includes("Risk") || label.includes("Churn")) {
            if (trend?.startsWith("+")) trendColor = "text-red-400";
            if (trend?.startsWith("-")) trendColor = "text-green-400";
        }

        return (
            <KpiCard
                title={label}
                icon={Icon}
                primaryMetric={value || "0"}
                trend={trend}
                trendColor={trendColor}
                badge={status === "critical" ? "Critical" : undefined}
                valueColor="text-white"
            />
        );
    }

    if (type === "LineChart" || type === "BarChart") {
        const chartData = data[dataKey || ""] || [];

        return (
            <ChartCard title={label} className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                        <XAxis dataKey={xAxis} stroke="#666" fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis stroke="#666" fontSize={10} tickLine={false} axisLine={false} />
                        <Tooltip
                            contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "6px" }}
                            itemStyle={{ fontSize: "12px", color: "#fff" }}
                        />
                        {type === "LineChart" ? (
                            <Line type="monotone" dataKey={yAxis} stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: "#3b82f6" }} />
                        ) : (
                            <Bar dataKey={yAxis} fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={30} />
                        )}
                    </ComposedChart>
                </ResponsiveContainer>
            </ChartCard>
        );
    }

    if (type === "Table" && label.includes("Alerts")) {
        // Special mapping for alerts if data matches structure
        const alerts = data[dataKey || ""] || [];
        const mappedAlerts = alerts.map((a: any) => ({
            id: a.id,
            source: a.source,
            message: a.message,
            severity: a.severity || "info",
            time: a.timestamp || "Just now"
        }));
        return <AlertPanel alerts={mappedAlerts} />;
    }

    // Fallback for generic tables or unknown types
    return (
        <ChartCard title={label} className="min-h-[200px]">
            <div className="flex items-center justify-center h-full text-muted-foreground">
                {type} component (Not implemented yet)
            </div>
        </ChartCard>
    );
}
