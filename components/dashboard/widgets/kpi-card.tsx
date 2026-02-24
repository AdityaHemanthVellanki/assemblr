"use client";

import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { staggerItem } from "@/lib/ui/motion";
import { useAnimatedNumber } from "@/lib/ui/use-animated-number";

export interface KpiCardProps {
    title: string;
    icon: LucideIcon;
    primaryMetric: string | number;
    secondaryMetric?: string;
    subMetric?: string;
    trend?: string;
    trendColor?: string;
    badge?: string;
    valueColor?: string;
    sparkline?: number[];
}

export function KpiCard({ title, icon: Icon, primaryMetric, secondaryMetric, subMetric, trend, trendColor, badge, valueColor, sparkline }: KpiCardProps) {
    const TrendIcon = trend?.startsWith("+") ? TrendingUp : trend?.startsWith("-") ? TrendingDown : Minus;

    // Animate numeric values
    const numericValue = typeof primaryMetric === "number" ? primaryMetric : parseFloat(String(primaryMetric));
    const isNumeric = !isNaN(numericValue) && typeof primaryMetric === "number";
    const animatedValue = useAnimatedNumber(isNumeric ? numericValue : 0);

    const displayMetric = isNumeric
        ? Number.isInteger(numericValue)
            ? Math.round(animatedValue).toLocaleString()
            : animatedValue.toFixed(1)
        : primaryMetric;

    return (
        <motion.div variants={staggerItem}>
            <Card className="bg-white/[0.03] border-white/5 hover:border-white/10 hover:bg-white/[0.06] transition-all duration-300 group overflow-hidden relative cursor-pointer">
                <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                                <Icon className="w-4 h-4 text-primary opacity-80 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">{title}</span>
                        </div>
                        {badge && (
                            <Badge variant="destructive" className="text-[10px] h-5 px-1.5 animate-pulse">
                                {badge}
                            </Badge>
                        )}
                    </div>

                    <div className="flex items-end justify-between gap-3">
                        <div className="flex-1">
                            <div className={`text-3xl font-bold tracking-tight tabular-nums ${valueColor || "text-white"}`}>
                                {displayMetric}
                            </div>

                            <div className="flex items-center gap-2 mt-1.5">
                                {trend && (
                                    <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${trendColor}`}>
                                        <TrendIcon className="w-3 h-3" />
                                        {trend}
                                    </span>
                                )}
                                {secondaryMetric && <span className="text-xs text-neutral-400 font-medium">{secondaryMetric}</span>}
                                {subMetric && <span className="text-[10px] text-muted-foreground/50">{subMetric}</span>}
                            </div>
                        </div>

                        {/* Mini sparkline */}
                        {sparkline && sparkline.length > 1 && (
                            <MiniSparkline values={sparkline} color={trendColor ?? "text-primary"} />
                        )}
                    </div>
                </CardContent>

                {/* Hover gradient */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            </Card>
        </motion.div>
    );
}

function MiniSparkline({ values, color }: { values: number[]; color: string }) {
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = max - min || 1;
    const w = 64;
    const h = 28;
    const step = w / Math.max(values.length - 1, 1);

    const points = values.map((v, i) => `${i * step},${h - ((v - min) / range) * h}`).join(" ");

    // Gradient fill path
    const fillPoints = `0,${h} ${points} ${(values.length - 1) * step},${h}`;

    const strokeColor = color.includes("green") || color.includes("emerald")
        ? "#34d399"
        : color.includes("red")
        ? "#f87171"
        : "#818cf8";

    return (
        <svg width={w} height={h} className="shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
            <defs>
                <linearGradient id={`spark-${strokeColor}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={strokeColor} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
                </linearGradient>
            </defs>
            <polygon points={fillPoints} fill={`url(#spark-${strokeColor})`} />
            <motion.polyline
                points={points}
                fill="none"
                stroke={strokeColor}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1, delay: 0.3, ease: "easeOut" }}
            />
        </svg>
    );
}
