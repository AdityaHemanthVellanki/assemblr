import { motion } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { MoreHorizontal } from "lucide-react";

const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0 },
};

export function ChartCard({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
    return (
        <motion.div variants={itemVariants} className={`h-full ${className}`}>
            <Card className="h-full bg-white/[0.03] border-white/5 flex flex-col shadow-sm backdrop-blur-sm transition-all duration-300 hover:border-white/10">
                <CardHeader className="py-3 px-4 border-b border-white/5 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</CardTitle>
                    <MoreHorizontal className="w-4 h-4 text-muted-foreground opacity-50 cursor-pointer hover:text-white hover:opacity-100" />
                </CardHeader>
                <CardContent className="flex-1 w-full min-h-0 pt-4 pb-2 px-2 relative text-xs">
                    {children}
                </CardContent>
            </Card>
        </motion.div>
    );
}
