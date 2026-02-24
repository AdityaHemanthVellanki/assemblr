"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { MoreHorizontal, Maximize2, Minimize2, Download, Copy, Check } from "lucide-react";
import { staggerItem } from "@/lib/ui/motion";

export function ChartCard({
    title,
    children,
    className,
    subtitle,
    onExport,
}: {
    title: string;
    children: React.ReactNode;
    className?: string;
    subtitle?: string;
    onExport?: () => void;
}) {
    const [isFullscreen, setIsFullscreen] = React.useState(false);
    const [showMenu, setShowMenu] = React.useState(false);
    const [copied, setCopied] = React.useState(false);

    const handleCopyTitle = () => {
        navigator.clipboard.writeText(title);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const chartContent = (
        <Card className="h-full bg-white/[0.03] border-white/5 flex flex-col shadow-sm backdrop-blur-sm transition-all duration-300 hover:border-white/10 group/chart">
            <CardHeader className="py-3 px-4 border-b border-white/5 flex flex-row items-center justify-between space-y-0">
                <div className="flex items-center gap-2 min-w-0">
                    <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">
                        {title}
                    </CardTitle>
                    {subtitle && (
                        <span className="text-[10px] text-muted-foreground/40 truncate hidden sm:inline">{subtitle}</span>
                    )}
                </div>
                <div className="flex items-center gap-1 opacity-0 translate-y-1 group-hover/chart:opacity-100 group-hover/chart:translate-y-0 transition-all duration-200">
                    {onExport && (
                        <button
                            onClick={onExport}
                            className="h-6 w-6 rounded-md hover:bg-white/10 flex items-center justify-center transition-colors"
                            title="Export data"
                            type="button"
                        >
                            <Download className="w-3.5 h-3.5 text-muted-foreground hover:text-white" />
                        </button>
                    )}
                    <button
                        onClick={handleCopyTitle}
                        className="h-6 w-6 rounded-md hover:bg-white/10 flex items-center justify-center transition-colors"
                        title="Copy title"
                        type="button"
                    >
                        {copied ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                            <Copy className="w-3.5 h-3.5 text-muted-foreground hover:text-white" />
                        )}
                    </button>
                    <button
                        onClick={() => setIsFullscreen(!isFullscreen)}
                        className="h-6 w-6 rounded-md hover:bg-white/10 flex items-center justify-center transition-colors"
                        title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                        type="button"
                    >
                        {isFullscreen ? (
                            <Minimize2 className="w-3.5 h-3.5 text-muted-foreground hover:text-white" />
                        ) : (
                            <Maximize2 className="w-3.5 h-3.5 text-muted-foreground hover:text-white" />
                        )}
                    </button>
                    <div className="relative">
                        <button
                            onClick={() => setShowMenu(!showMenu)}
                            className="h-6 w-6 rounded-md hover:bg-white/10 flex items-center justify-center transition-colors"
                            type="button"
                        >
                            <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground hover:text-white" />
                        </button>
                        <AnimatePresence>
                            {showMenu && (
                                <motion.div
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 4 }}
                                    className="absolute right-0 top-full mt-1 z-50 w-36 bg-[#1a1a1d] border border-white/10 rounded-lg shadow-2xl overflow-hidden"
                                    onMouseLeave={() => setShowMenu(false)}
                                >
                                    <button
                                        className="w-full text-left px-3 py-2 text-xs text-muted-foreground hover:bg-white/5 hover:text-white transition-colors"
                                        onClick={() => { setIsFullscreen(true); setShowMenu(false); }}
                                        type="button"
                                    >
                                        Expand chart
                                    </button>
                                    {onExport && (
                                        <button
                                            className="w-full text-left px-3 py-2 text-xs text-muted-foreground hover:bg-white/5 hover:text-white transition-colors"
                                            onClick={() => { onExport(); setShowMenu(false); }}
                                            type="button"
                                        >
                                            Export data
                                        </button>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="flex-1 w-full min-h-0 pt-4 pb-2 px-2 relative text-xs">
                {children}
            </CardContent>
        </Card>
    );

    return (
        <>
            <motion.div variants={staggerItem} className={`h-full ${className ?? ""}`}>
                {chartContent}
            </motion.div>

            {/* Fullscreen overlay */}
            <AnimatePresence>
                {isFullscreen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-8"
                        onClick={() => setIsFullscreen(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="w-full max-w-5xl h-[80vh]"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {chartContent}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
