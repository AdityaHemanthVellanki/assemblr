import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LucideIcon } from "lucide-react";

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
}

const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0 },
};

export function KpiCard({ title, icon: Icon, primaryMetric, secondaryMetric, subMetric, trend, trendColor, badge, valueColor }: KpiCardProps) {
    return (
        <motion.div variants={itemVariants}>
            <Card className="bg-white/[0.03] border-white/5 hover:border-white/10 hover:bg-white/[0.06] transition-all duration-300 group overflow-hidden relative">
                <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Icon className="w-4 h-4 opacity-70 group-hover:opacity-100 transition-opacity" />
                            <span className="text-xs font-medium uppercase tracking-wider">{title}</span>
                        </div>
                        {badge && <Badge variant="destructive" className="text-[10px] h-4 px-1">{badge}</Badge>}
                    </div>

                    <div className={`text-2xl font-bold tracking-tight mb-1 ${valueColor || "text-white"}`}>
                        {primaryMetric}
                    </div>

                    <div className="flex flex-col gap-0.5">
                        {secondaryMetric && <div className="text-xs text-neutral-400 font-medium">{secondaryMetric}</div>}
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                            {trend && <span className={`${trendColor} font-bold`}>{trend}</span>}
                            {subMetric}
                        </div>
                    </div>
                </CardContent>
                <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            </Card>
        </motion.div>
    );
}
