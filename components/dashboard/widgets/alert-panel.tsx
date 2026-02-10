import { motion } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Bell, MessageSquare, CreditCard, Github, Zap, LucideIcon } from "lucide-react";

export interface AlertItem {
    id: string | number;
    source: string;
    message: string;
    severity: "critical" | "warning" | "info";
    time: string;
    icon?: LucideIcon;
}

const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0 },
};

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
        bg: "bg-red-500/10 border-red-500/20"
    },
    warning: {
        color: "text-orange-500",
        bg: "bg-orange-500/10 border-orange-500/20"
    },
    info: {
        color: "text-blue-500",
        bg: "bg-blue-500/10 border-blue-500/20"
    }
};

export function AlertPanel({ alerts }: { alerts: AlertItem[] }) {
    const activeCount = alerts.length;

    return (
        <motion.div variants={itemVariants} className="flex-1 flex flex-col min-h-0">
            <Card className="flex-1 bg-white/[0.03] border-white/5 flex flex-col overflow-hidden">
                <CardHeader className="py-3 px-4 border-b border-white/5 bg-white/[0.02] flex items-center justify-between space-y-0">
                    <div className="flex items-center gap-2">
                        <Bell className="w-4 h-4 text-muted-foreground" />
                        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Live Alerts</CardTitle>
                    </div>
                    {activeCount > 0 && (
                        <div className="flex items-center gap-1.5">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                            </span>
                            <span className="text-[10px] text-red-500 font-medium">{activeCount} Active</span>
                        </div>
                    )}
                </CardHeader>
                <CardContent className="p-0 overflow-auto flex-1 scrollbar-hide">
                    {alerts.length === 0 ? (
                        <div className="p-6 text-center text-xs text-muted-foreground">
                            No active alerts.
                        </div>
                    ) : (
                        <div className="divide-y divide-white/5">
                            {alerts.map((alert) => {
                                const Icon = alert.icon || SOURCE_ICONS[alert.source] || Bell;
                                const style = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.info;

                                return (
                                    <div key={alert.id} className="p-3 hover:bg-white/5 transition-colors group cursor-pointer border-l-2 border-transparent hover:border-l-primary/50 relative">
                                        <div className="flex gap-3">
                                            <div className={`mt-0.5 p-1.5 rounded-md h-fit ${style.bg}`}>
                                                <Icon className={`w-3.5 h-3.5 ${style.color}`} />
                                            </div>
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-bold text-muted-foreground uppercase">{alert.source}</span>
                                                    <span className="text-[10px] text-muted-foreground/50">•</span>
                                                    <span className="text-[10px] text-muted-foreground/50">{alert.time}</span>
                                                </div>
                                                <p className="text-xs text-neutral-300 font-medium leading-relaxed group-hover:text-white transition-colors">
                                                    {alert.message}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
        </motion.div>
    );
}
