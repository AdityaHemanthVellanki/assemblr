"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Copy,
  Check,
  ExternalLink,
  Hash,
  Calendar,
  Link2,
  Circle,
  X,
  Columns3,
  SlidersHorizontal,
  LayoutGrid,
  List,
  Eye,
  EyeOff,
  MoreHorizontal,
  Maximize2,
  ChevronDown,
  Clock,
  Tag,
  User,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Minus,
} from "lucide-react";
import type { ViewSpec } from "@/lib/toolos/spec";

// ─────────────────────────────────────────────────────────────────────────────
// SHARED TYPES
// ─────────────────────────────────────────────────────────────────────────────

type SortDir = "asc" | "desc" | null;

interface CellRenderInfo {
  value: any;
  key: string;
  row: Record<string, any>;
}

// ─────────────────────────────────────────────────────────────────────────────
// SMART CELL RENDERER
// ─────────────────────────────────────────────────────────────────────────────

function SmartCell({ value, colKey }: { value: any; colKey: string }) {
  const [copied, setCopied] = React.useState(false);

  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground/30">—</span>;
  }

  const str = String(value);

  // Boolean
  if (typeof value === "boolean") {
    return value ? (
      <span className="inline-flex items-center gap-1 text-emerald-400">
        <CheckCircle2 className="w-3.5 h-3.5" /> Yes
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 text-muted-foreground/60">
        <XCircle className="w-3.5 h-3.5" /> No
      </span>
    );
  }

  // Arrays (labels, tags, assignees)
  if (Array.isArray(value)) {
    const items = value.slice(0, 5).map((v: any) => typeof v === "object" ? (v.name ?? v.label ?? JSON.stringify(v)) : String(v));
    return (
      <div className="flex flex-wrap gap-1">
        {items.map((item: string, i: number) => (
          <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] text-muted-foreground">
            <Tag className="w-2.5 h-2.5 mr-0.5 opacity-50" />
            {item}
          </span>
        ))}
        {value.length > 5 && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-white/5 text-[10px] text-muted-foreground/50">+{value.length - 5}</span>
        )}
      </div>
    );
  }

  // Status badges
  const lowerKey = colKey.toLowerCase();
  const lowerVal = str.toLowerCase();
  if (lowerKey.includes("status") || lowerKey.includes("state") || lowerKey === "priority") {
    return <StatusBadge value={str} />;
  }

  // Commit SHAs
  if ((lowerKey.includes("sha") || lowerKey.includes("commit")) && /^[0-9a-f]{7,40}$/i.test(str)) {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded">
        <Hash className="w-3 h-3 opacity-50" />
        {str.substring(0, 7)}
      </span>
    );
  }

  // URLs
  if (str.startsWith("http://") || str.startsWith("https://")) {
    return (
      <a
        href={str}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-primary hover:text-primary/80 transition-colors max-w-[250px] truncate"
        onClick={(e) => e.stopPropagation()}
      >
        <Link2 className="w-3 h-3 shrink-0" />
        <span className="truncate">{str.replace(/^https?:\/\/(www\.)?/, "").split("/").slice(0, 2).join("/")}</span>
        <ExternalLink className="w-3 h-3 shrink-0 opacity-50" />
      </a>
    );
  }

  // Emails
  if (str.includes("@") && str.includes(".") && !str.includes(" ")) {
    return (
      <span className="inline-flex items-center gap-1 text-blue-400">
        <User className="w-3 h-3 shrink-0" />
        <span className="truncate max-w-[200px]">{str}</span>
      </span>
    );
  }

  // Dates/timestamps — detect by key name OR ISO 8601 format
  const isDateKey = lowerKey.includes("date") || lowerKey.includes("time") || lowerKey.includes("_at") || lowerKey.includes("created") || lowerKey.includes("updated") || lowerKey.includes("closed") || lowerKey.includes("merged") || lowerKey.includes("due") || lowerKey.includes("start") || lowerKey.includes("end");
  const isIsoDate = /^\d{4}-\d{2}-\d{2}T/.test(str);
  if (isDateKey || isIsoDate) {
    const d = new Date(str);
    if (!isNaN(d.getTime()) && str.length > 8) {
      return (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground" title={d.toLocaleString()}>
          <Calendar className="w-3 h-3 shrink-0 opacity-60" />
          <span>{formatRelativeDate(d)}</span>
        </span>
      );
    }
  }

  // Numbers with formatting
  if (typeof value === "number") {
    if (lowerKey.includes("amount") || lowerKey.includes("price") || lowerKey.includes("revenue") || lowerKey.includes("cost") || lowerKey.includes("balance")) {
      return <span className="font-mono tabular-nums text-emerald-400">${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>;
    }
    if (lowerKey.includes("percent") || lowerKey.includes("rate") || lowerKey.includes("score")) {
      const pct = value <= 1 ? value * 100 : value;
      const color = pct >= 80 ? "text-emerald-400" : pct >= 50 ? "text-amber-400" : "text-red-400";
      return <span className={`font-mono tabular-nums ${color}`}>{pct.toFixed(1)}%</span>;
    }
    if (lowerKey.includes("duration") || lowerKey === "minutes" || lowerKey === "mins") {
      if (value >= 60) {
        const h = Math.floor(value / 60);
        const m = Math.round(value % 60);
        return <span className="inline-flex items-center gap-1 text-muted-foreground"><Clock className="w-3 h-3 opacity-50" />{h}h {m}m</span>;
      }
      return <span className="inline-flex items-center gap-1 text-muted-foreground"><Clock className="w-3 h-3 opacity-50" />{value}m</span>;
    }
    if (lowerKey.includes("stars") || lowerKey.includes("count") || lowerKey.includes("total")) {
      return <span className="font-mono tabular-nums text-foreground/80">{value.toLocaleString()}</span>;
    }
    return <span className="font-mono tabular-nums">{value.toLocaleString()}</span>;
  }

  // Long strings with copy
  if (str.length > 60) {
    return (
      <div className="group/cell relative">
        <span className="line-clamp-2 text-foreground/80">{str}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(str);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="absolute right-0 top-0 opacity-0 group-hover/cell:opacity-100 transition-opacity bg-[#18181b] px-1 rounded"
          type="button"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
        </button>
      </div>
    );
  }

  // Default
  return <span className="text-foreground/90">{str}</span>;
}

function StatusBadge({ value }: { value: string }) {
  const lower = value.toLowerCase();
  const statusStyles: Record<string, string> = {
    // Success states
    open: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    done: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    resolved: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    merged: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    healthy: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    paid: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    // Warning states
    "in progress": "bg-blue-500/10 text-blue-400 border-blue-500/20",
    in_progress: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    review: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    "in review": "bg-amber-500/10 text-amber-400 border-amber-500/20",
    draft: "bg-neutral-500/10 text-neutral-400 border-neutral-500/20",
    warning: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    // Danger states
    closed: "bg-red-500/10 text-red-400 border-red-500/20",
    failed: "bg-red-500/10 text-red-400 border-red-500/20",
    blocked: "bg-red-500/10 text-red-400 border-red-500/20",
    cancelled: "bg-neutral-500/10 text-neutral-400 border-neutral-500/20",
    critical: "bg-red-500/10 text-red-400 border-red-500/20",
    overdue: "bg-red-500/10 text-red-400 border-red-500/20",
    // Priority
    urgent: "bg-red-500/10 text-red-400 border-red-500/20",
    high: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    low: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    none: "bg-neutral-500/10 text-neutral-400 border-neutral-500/20",
  };

  const style = statusStyles[lower] ?? "bg-white/5 text-muted-foreground border-white/10";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${style}`}>
      <Circle className="w-1.5 h-1.5 fill-current" />
      {value}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERACTIVE TABLE VIEW
// ─────────────────────────────────────────────────────────────────────────────

export function InteractiveTableView({
  view,
  data,
  onSelectRow,
}: {
  view: ViewSpec;
  data: any;
  onSelectRow: (row: Record<string, any>) => void;
}) {
  const allRows = React.useMemo(() => normalizeRows(view, data), [view, data]);
  const columns = React.useMemo(() => {
    if (view.fields?.length > 0) return view.fields;
    if (allRows.length > 0) return Object.keys(allRows[0]).filter((k) => !k.startsWith("_"));
    return [];
  }, [view.fields, allRows]);

  // State
  const [search, setSearch] = React.useState("");
  const [sortCol, setSortCol] = React.useState<string | null>(null);
  const [sortDir, setSortDir] = React.useState<SortDir>(null);
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(25);
  const [hiddenCols, setHiddenCols] = React.useState<Set<string>>(new Set());
  const [selectedRows, setSelectedRows] = React.useState<Set<number>>(new Set());
  const [columnFilters, setColumnFilters] = React.useState<Record<string, string>>({});
  const [density, setDensity] = React.useState<"compact" | "normal" | "comfortable">("normal");
  const [showColumnPicker, setShowColumnPicker] = React.useState(false);

  // Filter rows
  const filteredRows = React.useMemo(() => {
    let rows = allRows;

    // Global search
    if (search) {
      const lower = search.toLowerCase();
      rows = rows.filter((row) =>
        Object.values(row).some((v) => String(v ?? "").toLowerCase().includes(lower)),
      );
    }

    // Column filters
    for (const [col, filterVal] of Object.entries(columnFilters)) {
      if (!filterVal) continue;
      const lower = filterVal.toLowerCase();
      rows = rows.filter((row) => String(row[col] ?? "").toLowerCase().includes(lower));
    }

    return rows;
  }, [allRows, search, columnFilters]);

  // Sort rows
  const sortedRows = React.useMemo(() => {
    if (!sortCol || !sortDir) return filteredRows;
    return [...filteredRows].sort((a, b) => {
      const aVal = a[sortCol] ?? "";
      const bVal = b[sortCol] ?? "";
      const aNum = Number(aVal);
      const bNum = Number(bVal);
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return sortDir === "asc" ? aNum - bNum : bNum - aNum;
      }
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filteredRows, sortCol, sortDir]);

  // Paginate
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const pageRows = sortedRows.slice(page * pageSize, (page + 1) * pageSize);
  const visibleColumns = columns.filter((c) => !hiddenCols.has(c));

  // Reset page on filter change
  React.useEffect(() => { setPage(0); }, [search, columnFilters]);

  const toggleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir(sortDir === "asc" ? "desc" : sortDir === "desc" ? null : "asc");
      if (sortDir === "desc") setSortCol(null);
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const toggleRowSelect = (idx: number) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const densityPadding = density === "compact" ? "px-3 py-1.5" : density === "comfortable" ? "px-5 py-4" : "px-4 py-3";
  const densityText = density === "compact" ? "text-xs" : "text-sm";

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 mb-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${allRows.length} rows...`}
            className="w-full h-9 pl-9 pr-8 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40 transition-all"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2" type="button">
              <X className="w-3.5 h-3.5 text-muted-foreground hover:text-white" />
            </button>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1.5">
          {/* Column picker */}
          <div className="relative">
            <button
              onClick={() => setShowColumnPicker(!showColumnPicker)}
              className="h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-xs text-muted-foreground hover:text-white hover:bg-white/10 transition-colors flex items-center gap-1.5"
              type="button"
            >
              <Columns3 className="w-3.5 h-3.5" />
              Columns
              {hiddenCols.size > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary/20 text-primary text-[10px]">{hiddenCols.size} hidden</span>
              )}
            </button>
            <AnimatePresence>
              {showColumnPicker && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  className="absolute right-0 top-full mt-1 z-50 w-52 bg-[#1a1a1d] border border-white/10 rounded-xl shadow-2xl overflow-hidden"
                >
                  <div className="p-2 border-b border-white/5">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Toggle columns</span>
                  </div>
                  <div className="p-1 max-h-64 overflow-auto">
                    {columns.map((col) => (
                      <button
                        key={col}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs hover:bg-white/5 transition-colors"
                        onClick={() => {
                          setHiddenCols((prev) => {
                            const next = new Set(prev);
                            if (next.has(col)) next.delete(col);
                            else next.add(col);
                            return next;
                          });
                        }}
                        type="button"
                      >
                        {hiddenCols.has(col) ? (
                          <EyeOff className="w-3.5 h-3.5 text-muted-foreground/50" />
                        ) : (
                          <Eye className="w-3.5 h-3.5 text-primary" />
                        )}
                        <span className={hiddenCols.has(col) ? "text-muted-foreground/50" : "text-white"}>{humanizeColumnName(col)}</span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Density */}
          <div className="flex items-center bg-white/5 border border-white/10 rounded-lg overflow-hidden">
            {(["compact", "normal", "comfortable"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDensity(d)}
                className={`h-9 px-2.5 text-[10px] uppercase tracking-wider transition-colors ${
                  density === d ? "bg-white/10 text-white" : "text-muted-foreground hover:text-white"
                }`}
                title={d}
                type="button"
              >
                {d === "compact" ? <List className="w-3.5 h-3.5" /> : d === "comfortable" ? <LayoutGrid className="w-3.5 h-3.5" /> : <SlidersHorizontal className="w-3.5 h-3.5" />}
              </button>
            ))}
          </div>

          {/* Row count */}
          <span className="text-[10px] text-muted-foreground/60 tabular-nums px-2">
            {filteredRows.length}{filteredRows.length !== allRows.length ? ` / ${allRows.length}` : ""} rows
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-xl border border-white/5">
        <table className={`w-full ${densityText}`}>
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-white/10 bg-[#0c0c0e]">
              {/* Select all */}
              <th className={`${densityPadding} w-10`}>
                <input
                  type="checkbox"
                  checked={selectedRows.size === pageRows.length && pageRows.length > 0}
                  onChange={() => {
                    if (selectedRows.size === pageRows.length) {
                      setSelectedRows(new Set());
                    } else {
                      setSelectedRows(new Set(pageRows.map((_, i) => page * pageSize + i)));
                    }
                  }}
                  className="rounded border-white/20 bg-white/5 text-primary focus:ring-primary/30 w-3.5 h-3.5 cursor-pointer"
                />
              </th>
              {visibleColumns.map((col) => (
                <th key={col} className={`${densityPadding} text-left group`}>
                  <button
                    className="flex items-center gap-1.5 w-full text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 hover:text-white transition-colors"
                    onClick={() => toggleSort(col)}
                    type="button"
                  >
                    {humanizeColumnName(col)}
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                      {sortCol === col && sortDir === "asc" ? (
                        <ArrowUp className="w-3 h-3 text-primary" />
                      ) : sortCol === col && sortDir === "desc" ? (
                        <ArrowDown className="w-3 h-3 text-primary" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3" />
                      )}
                    </span>
                  </button>
                  {/* Column filter */}
                  <input
                    value={columnFilters[col] ?? ""}
                    onChange={(e) => setColumnFilters((prev) => ({ ...prev, [col]: e.target.value }))}
                    placeholder="Filter..."
                    className="mt-1 w-full h-6 px-1.5 rounded bg-white/5 border border-transparent text-[10px] text-white placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/30 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all"
                    onClick={(e) => e.stopPropagation()}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + 1} className="px-4 py-12 text-center text-sm text-muted-foreground/50">
                  {search || Object.values(columnFilters).some(Boolean) ? "No matching rows found." : "No data available."}
                </td>
              </tr>
            ) : (
              pageRows.map((row, i) => {
                const globalIdx = page * pageSize + i;
                const isSelected = selectedRows.has(globalIdx);
                return (
                  <motion.tr
                    key={globalIdx}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.01 }}
                    className={`border-b border-white/5 cursor-pointer transition-colors ${
                      isSelected ? "bg-primary/5" : "hover:bg-white/[0.03]"
                    }`}
                    onClick={() => onSelectRow(row)}
                  >
                    <td className={`${densityPadding} w-10`} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRowSelect(globalIdx)}
                        className="rounded border-white/20 bg-white/5 text-primary focus:ring-primary/30 w-3.5 h-3.5 cursor-pointer"
                      />
                    </td>
                    {visibleColumns.map((col) => (
                      <td key={col} className={`${densityPadding} max-w-[300px]`}>
                        <SmartCell value={row[col]} colKey={col} />
                      </td>
                    ))}
                  </motion.tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {sortedRows.length > pageSize && (
        <div className="flex items-center justify-between mt-3 px-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
              className="h-7 px-2 rounded-md bg-white/5 border border-white/10 text-xs text-white focus:outline-none focus:ring-1 focus:ring-primary/30 cursor-pointer"
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-muted-foreground mr-2 tabular-nums">
              {page * pageSize + 1}–{Math.min((page + 1) * pageSize, sortedRows.length)} of {sortedRows.length}
            </span>
            <button onClick={() => setPage(0)} disabled={page === 0} className="h-7 w-7 rounded-md hover:bg-white/5 disabled:opacity-30 flex items-center justify-center transition-colors" type="button">
              <ChevronsLeft className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <button onClick={() => setPage(page - 1)} disabled={page === 0} className="h-7 w-7 rounded-md hover:bg-white/5 disabled:opacity-30 flex items-center justify-center transition-colors" type="button">
              <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <button onClick={() => setPage(page + 1)} disabled={page >= totalPages - 1} className="h-7 w-7 rounded-md hover:bg-white/5 disabled:opacity-30 flex items-center justify-center transition-colors" type="button">
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1} className="h-7 w-7 rounded-md hover:bg-white/5 disabled:opacity-30 flex items-center justify-center transition-colors" type="button">
              <ChevronsRight className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERACTIVE KANBAN VIEW
// ─────────────────────────────────────────────────────────────────────────────

export function InteractiveKanbanView({
  view,
  data,
  onSelectRow,
}: {
  view: ViewSpec;
  data: any;
  onSelectRow: (row: Record<string, any>) => void;
}) {
  const allRows = React.useMemo(() => normalizeRows(view, data), [view, data]);
  const groupField = view.fields?.[0] ?? "status";
  const titleField = view.fields?.[1] ?? "title";
  const metaField = view.fields?.[2] ?? null;
  const [search, setSearch] = React.useState("");
  const [collapsedCols, setCollapsedCols] = React.useState<Set<string>>(new Set());
  const [expandedCard, setExpandedCard] = React.useState<number | null>(null);

  const filteredRows = React.useMemo(() => {
    if (!search) return allRows;
    const lower = search.toLowerCase();
    return allRows.filter((row) =>
      Object.values(row).some((v) => String(v ?? "").toLowerCase().includes(lower)),
    );
  }, [allRows, search]);

  const groups = React.useMemo(() => {
    const g: Record<string, any[]> = {};
    for (const row of filteredRows) {
      const key = String(row[groupField] ?? "Other");
      if (!g[key]) g[key] = [];
      g[key].push(row);
    }
    return g;
  }, [filteredRows, groupField]);

  const groupOrder = React.useMemo(() => {
    const priorityOrder = ["open", "in progress", "in_progress", "in review", "review", "todo", "pending", "done", "completed", "closed", "cancelled"];
    return Object.keys(groups).sort((a, b) => {
      const aIdx = priorityOrder.indexOf(a.toLowerCase());
      const bIdx = priorityOrder.indexOf(b.toLowerCase());
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [groups]);

  const toggleCollapse = (group: string) => {
    setCollapsedCols((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const columnColors: Record<string, string> = {
    open: "border-t-emerald-500",
    "in progress": "border-t-blue-500",
    in_progress: "border-t-blue-500",
    todo: "border-t-neutral-500",
    pending: "border-t-amber-500",
    "in review": "border-t-purple-500",
    review: "border-t-purple-500",
    done: "border-t-emerald-500",
    completed: "border-t-emerald-500",
    closed: "border-t-red-500",
    cancelled: "border-t-neutral-500",
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search cards..."
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40 transition-all"
          />
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>{filteredRows.length} cards</span>
          <span className="text-muted-foreground/30">|</span>
          <span>{groupOrder.length} columns</span>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-4 h-full pb-4 min-w-max">
          {groupOrder.map((group) => {
            const items = groups[group];
            const isCollapsed = collapsedCols.has(group);
            const topBorder = columnColors[group.toLowerCase()] ?? "border-t-white/20";

            return (
              <motion.div
                key={group}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                className={`shrink-0 rounded-xl border border-white/5 bg-white/[0.015] flex flex-col transition-all ${
                  isCollapsed ? "w-14" : "w-80"
                } border-t-2 ${topBorder}`}
              >
                {/* Column header */}
                <button
                  className="flex items-center gap-2 px-4 py-3 border-b border-white/5 cursor-pointer hover:bg-white/[0.03] transition-colors"
                  onClick={() => toggleCollapse(group)}
                  type="button"
                >
                  {isCollapsed ? (
                    <span className="text-xs font-semibold text-muted-foreground [writing-mode:vertical-lr] rotate-180">{group}</span>
                  ) : (
                    <>
                      <StatusBadge value={group} />
                      <span className="ml-auto text-[10px] font-medium text-muted-foreground/60 bg-white/5 rounded-full px-2 py-0.5 tabular-nums">
                        {items.length}
                      </span>
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/40" />
                    </>
                  )}
                </button>

                {/* Cards */}
                {!isCollapsed && (
                  <div className="flex-1 overflow-auto p-2 space-y-2">
                    {items.map((item, i) => {
                      const cardKey = page_key(item, i);
                      const isExpanded = expandedCard === cardKey;
                      const title = String(item[titleField] ?? item[Object.keys(item)[1]] ?? "Untitled");
                      const meta = metaField ? String(item[metaField] ?? "") : null;

                      return (
                        <motion.div
                          key={cardKey}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.02 }}
                          className="rounded-lg border border-white/5 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/10 transition-all cursor-pointer group/card"
                          onClick={() => onSelectRow(item)}
                        >
                          <div className="p-3">
                            <div className="text-sm font-medium text-foreground/90 line-clamp-2 group-hover/card:text-white transition-colors">
                              {title}
                            </div>
                            {meta && (
                              <div className="mt-1.5 text-xs text-muted-foreground/60 line-clamp-1">{meta}</div>
                            )}
                            {/* Card metadata row */}
                            <div className="flex items-center gap-2 mt-2">
                              {item.assignee && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <User className="w-3 h-3" />
                                  {String(item.assignee).split("@")[0]}
                                </span>
                              )}
                              {(item.priority || item.Priority) && (
                                <StatusBadge value={String(item.priority || item.Priority)} />
                              )}
                              {(item.labels || item.label) && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded">
                                  <Tag className="w-2.5 h-2.5" />
                                  {String(item.labels ?? item.label).split(",")[0]}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Expand arrow */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedCard(isExpanded ? null : cardKey);
                            }}
                            className="w-full px-3 py-1 border-t border-white/5 opacity-0 group-hover/card:opacity-100 transition-opacity flex items-center justify-center"
                            type="button"
                          >
                            <Maximize2 className="w-3 h-3 text-muted-foreground/40" />
                          </button>

                          {/* Expanded details */}
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="px-3 pb-3 space-y-1.5 border-t border-white/5 pt-2">
                                  {Object.entries(item)
                                    .filter(([k]) => k !== titleField && k !== groupField && k !== metaField)
                                    .slice(0, 6)
                                    .map(([k, v]) => (
                                      <div key={k} className="flex items-start gap-2 text-[10px]">
                                        <span className="text-muted-foreground/50 uppercase tracking-wider shrink-0 w-20 truncate">{k}</span>
                                        <span className="text-foreground/70 truncate">{String(v ?? "—")}</span>
                                      </div>
                                    ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERACTIVE TIMELINE VIEW
// ─────────────────────────────────────────────────────────────────────────────

export function InteractiveTimelineView({
  view,
  data,
  onSelectRow,
}: {
  view?: ViewSpec;
  data: any;
  onSelectRow: (row: Record<string, any>) => void;
}) {
  const allRows = React.useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const [search, setSearch] = React.useState("");
  const [expandedIdx, setExpandedIdx] = React.useState<number | null>(null);
  const [groupBy, setGroupBy] = React.useState<string | null>(null);

  const dateFields = React.useMemo(() => {
    if (allRows.length === 0) return [];
    const first = allRows[0];
    return Object.keys(first).filter((k) => {
      const lower = k.toLowerCase();
      return lower.includes("date") || lower.includes("time") || lower.includes("_at") || lower.includes("created") || lower.includes("updated");
    });
  }, [allRows]);

  const groupFields = React.useMemo(() => {
    if (allRows.length === 0) return [];
    const first = allRows[0];
    return Object.keys(first).filter((k) => {
      const lower = k.toLowerCase();
      return lower.includes("type") || lower.includes("source") || lower.includes("category") || lower.includes("integration") || lower.includes("status");
    });
  }, [allRows]);

  const filteredRows = React.useMemo(() => {
    if (!search) return allRows;
    const lower = search.toLowerCase();
    return allRows.filter((row) =>
      Object.values(row).some((v) => String(v ?? "").toLowerCase().includes(lower)),
    );
  }, [allRows, search]);

  const groupedRows = React.useMemo(() => {
    if (!groupBy) return { "All Events": filteredRows };
    const groups: Record<string, any[]> = {};
    for (const row of filteredRows) {
      const key = String(row[groupBy] ?? "Other");
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    }
    return groups;
  }, [filteredRows, groupBy]);

  const getTitle = (row: any) => row.title || row.name || row.message || row.subject || row.summary || row.description || "Event";
  const getDate = (row: any) => {
    for (const f of dateFields) {
      if (row[f]) return row[f];
    }
    return row.timestamp || row.date || row.created_at || row.createdAt || row.time || "";
  };

  const getEventColor = (row: any) => {
    const status = String(row.status ?? row.type ?? row.severity ?? "").toLowerCase();
    if (["error", "failed", "critical", "bug"].includes(status)) return "bg-red-500 border-red-400";
    if (["warning", "alert", "review"].includes(status)) return "bg-amber-500 border-amber-400";
    if (["success", "completed", "done", "merged"].includes(status)) return "bg-emerald-500 border-emerald-400";
    if (["info", "note", "comment"].includes(status)) return "bg-blue-500 border-blue-400";
    return "bg-primary border-primary";
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events..."
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40 transition-all"
          />
        </div>
        <div className="flex items-center gap-2">
          {groupFields.length > 0 && (
            <select
              value={groupBy ?? ""}
              onChange={(e) => setGroupBy(e.target.value || null)}
              className="h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-xs text-white focus:outline-none focus:ring-1 focus:ring-primary/30 cursor-pointer"
            >
              <option value="">No grouping</option>
              {groupFields.map((f) => (
                <option key={f} value={f}>Group by {f}</option>
              ))}
            </select>
          )}
          <span className="text-[10px] text-muted-foreground/60 tabular-nums">{filteredRows.length} events</span>
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-auto">
        {Object.entries(groupedRows).map(([group, items]) => (
          <div key={group} className="mb-6 last:mb-0">
            {groupBy && (
              <div className="flex items-center gap-2 mb-3">
                <StatusBadge value={group} />
                <span className="text-[10px] text-muted-foreground/50">{items.length} events</span>
                <div className="flex-1 h-px bg-white/5" />
              </div>
            )}
            <div className="relative ml-4">
              {/* Vertical line */}
              <div className="absolute left-0 top-2 bottom-2 w-px bg-white/10" />

              {items.map((event, i) => {
                const title = getTitle(event);
                const dateStr = getDate(event);
                const dotColor = getEventColor(event);
                const isExpanded = expandedIdx === globalIndex(group, i);
                const d = dateStr ? new Date(dateStr) : null;

                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className="relative pl-8 pb-4 last:pb-0"
                  >
                    {/* Dot */}
                    <div className={`absolute left-[-4px] top-2 h-2.5 w-2.5 rounded-full border-2 ${dotColor}`} />

                    <div
                      className="rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10 transition-all cursor-pointer overflow-hidden"
                      onClick={() => onSelectRow(event)}
                    >
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-foreground/90 line-clamp-2">{title}</div>
                            {event.description && event.description !== title && (
                              <div className="mt-1 text-xs text-muted-foreground/60 line-clamp-2">{event.description}</div>
                            )}
                          </div>
                          {d && !isNaN(d.getTime()) && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/50 shrink-0">
                              <Clock className="w-3 h-3" />
                              {formatRelativeDate(d)}
                            </span>
                          )}
                        </div>

                        {/* Meta row */}
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {event.source && (
                            <span className="text-[10px] text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded">{event.source}</span>
                          )}
                          {event.type && <StatusBadge value={String(event.type)} />}
                          {event.author && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                              <User className="w-3 h-3" />
                              {String(event.author).split("@")[0]}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Expandable detail */}
                      <button
                        className="w-full py-1 border-t border-white/5 text-center opacity-0 hover:opacity-100 focus:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedIdx(isExpanded ? null : globalIndex(group, i));
                        }}
                        type="button"
                      >
                        <ChevronDown className={`w-3 h-3 mx-auto text-muted-foreground/30 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                      </button>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="px-4 pb-4 space-y-1.5 border-t border-white/5 pt-3">
                              {Object.entries(event)
                                .filter(([k]) => !["title", "name", "message", "description", "subject"].includes(k))
                                .map(([k, v]) => (
                                  <div key={k} className="flex items-start gap-2 text-[11px]">
                                    <span className="text-muted-foreground/40 uppercase tracking-wider shrink-0 w-24 truncate">{k}</span>
                                    <span className="text-foreground/60 break-all">{String(v ?? "—").slice(0, 200)}</span>
                                  </div>
                                ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERACTIVE DETAIL VIEW
// ─────────────────────────────────────────────────────────────────────────────

export function InteractiveDetailView({ data }: { data: any }) {
  const [activeTab, setActiveTab] = React.useState<"fields" | "raw">("fields");
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm p-8">
        <AlertCircle className="w-12 h-12 mb-4 opacity-20" />
        <p>No data available.</p>
      </div>
    );
  }

  const entries = typeof data === "object" && !Array.isArray(data) ? Object.entries(data) : [];
  const simpleFields = entries.filter(([, v]) => typeof v !== "object" || v === null);
  const complexFields = entries.filter(([, v]) => typeof v === "object" && v !== null);

  const copyField = (key: string, value: any) => {
    navigator.clipboard.writeText(String(value));
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-4 bg-white/5 p-1 rounded-lg w-fit">
        {(["fields", "raw"] as const).map((tab) => (
          <button
            key={tab}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeTab === tab ? "bg-white/10 text-white" : "text-muted-foreground hover:text-white"
            }`}
            onClick={() => setActiveTab(tab)}
            type="button"
          >
            {tab === "fields" ? "Fields" : "Raw JSON"}
          </button>
        ))}
      </div>

      {activeTab === "fields" ? (
        <div className="flex-1 overflow-auto space-y-6">
          {/* Simple fields */}
          <div className="rounded-xl border border-white/5 overflow-hidden">
            {simpleFields.map(([key, value], i) => (
              <div
                key={key}
                className={`flex items-start gap-4 px-4 py-3 group/field hover:bg-white/[0.03] transition-colors ${
                  i < simpleFields.length - 1 ? "border-b border-white/5" : ""
                }`}
              >
                <span className="text-[11px] text-muted-foreground/50 uppercase tracking-wider w-36 shrink-0 pt-0.5">{key}</span>
                <div className="flex-1 min-w-0">
                  <SmartCell value={value} colKey={key} />
                </div>
                <button
                  className="opacity-0 group-hover/field:opacity-100 transition-opacity shrink-0"
                  onClick={() => copyField(key, value)}
                  type="button"
                >
                  {copiedKey === key ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-muted-foreground/40 hover:text-white" />
                  )}
                </button>
              </div>
            ))}
          </div>

          {/* Complex/nested fields */}
          {complexFields.map(([key, value]) => (
            <div key={key} className="rounded-xl border border-white/5 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-white/5 bg-white/[0.02]">
                <span className="text-[11px] text-muted-foreground/70 uppercase tracking-wider font-semibold">{key}</span>
              </div>
              <pre className="p-4 text-xs text-muted-foreground font-mono overflow-auto max-h-48 bg-black/20">
                {JSON.stringify(value, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 overflow-auto rounded-xl border border-white/5">
          <pre className="p-4 text-xs text-muted-foreground font-mono leading-relaxed">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERACTIVE CHAT VIEW
// ─────────────────────────────────────────────────────────────────────────────

export function InteractiveChatView({ data }: { data: any }) {
  const messages = React.useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const [search, setSearch] = React.useState("");
  const bottomRef = React.useRef<HTMLDivElement>(null);

  const filteredMessages = React.useMemo(() => {
    if (!search) return messages;
    const lower = search.toLowerCase();
    return messages.filter((m) =>
      String(m.content ?? m.message ?? m.text ?? m).toLowerCase().includes(lower),
    );
  }, [messages, search]);

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      {messages.length > 5 && (
        <div className="relative mb-4 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search messages..."
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40 transition-all"
          />
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-auto space-y-3">
        {filteredMessages.map((msg, i) => {
          const content = msg.content ?? msg.message ?? msg.text ?? String(msg);
          const isUser = msg.role === "user" || msg.direction === "outbound" || msg.from === "user";
          const sender = msg.user ?? msg.from ?? msg.author ?? msg.sender ?? (isUser ? "You" : "System");
          const time = msg.timestamp ?? msg.time ?? msg.created_at ?? "";

          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02 }}
              className={`flex ${isUser ? "justify-end" : "justify-start"}`}
            >
              <div className={`max-w-[70%] rounded-2xl p-4 ${
                isUser
                  ? "bg-primary/10 border border-primary/20 rounded-br-md"
                  : "bg-white/[0.04] border border-white/5 rounded-bl-md"
              }`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {typeof sender === "object" ? (sender.name ?? sender.username ?? "User") : sender}
                  </span>
                  {time && (
                    <span className="text-[10px] text-muted-foreground/40">
                      {new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
                <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{content}</p>
                {msg.attachments && Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
                  <div className="mt-2 flex gap-1.5 flex-wrap">
                    {msg.attachments.map((att: any, j: number) => (
                      <span key={j} className="text-[10px] text-muted-foreground bg-white/5 px-2 py-0.5 rounded">
                        {att.name ?? att.filename ?? `Attachment ${j + 1}`}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RICH DETAIL SIDEBAR
// ─────────────────────────────────────────────────────────────────────────────

export function RichDetailSidebar({
  row,
  onClose,
  onAction,
  actions,
}: {
  row: Record<string, any>;
  onClose: () => void;
  onAction?: (actionId: string, input: Record<string, any>) => void;
  actions?: Array<{ id: string; name: string }>;
}) {
  const [activeTab, setActiveTab] = React.useState<"details" | "raw">("details");
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  const entries = Object.entries(row);
  const titleKey = entries.find(([k]) => ["title", "name", "subject", "label", "message"].includes(k.toLowerCase()));
  const title = titleKey ? String(titleKey[1]) : entries[0] ? String(entries[0][1]) : "Item";

  const copyField = (key: string, value: any) => {
    navigator.clipboard.writeText(String(value));
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="w-96 shrink-0 border-l border-white/10 bg-[#0a0a0c] overflow-hidden flex flex-col"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 bg-[#0c0c0e]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold uppercase text-muted-foreground/60 tracking-wider">Details</span>
          <button onClick={onClose} className="h-6 w-6 rounded-md hover:bg-white/10 flex items-center justify-center transition-colors" type="button">
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
        <h3 className="text-sm font-semibold text-white line-clamp-2">{title}</h3>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-2">
        {(["details", "raw"] as const).map((tab) => (
          <button
            key={tab}
            className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
              activeTab === tab ? "bg-white/10 text-white" : "text-muted-foreground hover:text-white"
            }`}
            onClick={() => setActiveTab(tab)}
            type="button"
          >
            {tab === "details" ? "Fields" : "JSON"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-4 pb-4">
        {activeTab === "details" ? (
          <div className="space-y-2">
            {entries.map(([key, value]) => (
              <div key={key} className="flex flex-col gap-0.5 border-b border-white/5 pb-2.5 last:border-b-0 group/field">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">{key}</span>
                  <button
                    className="opacity-0 group-hover/field:opacity-100 transition-opacity"
                    onClick={() => copyField(key, value)}
                    type="button"
                  >
                    {copiedKey === key ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3 text-muted-foreground/30" />
                    )}
                  </button>
                </div>
                <div className="text-sm">
                  {typeof value === "object" && value !== null ? (
                    <pre className="text-[10px] text-muted-foreground font-mono bg-black/20 rounded p-2 overflow-auto max-h-24">
                      {JSON.stringify(value, null, 2)}
                    </pre>
                  ) : (
                    <SmartCell value={value} colKey={key} />
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <pre className="text-[10px] text-muted-foreground font-mono leading-relaxed whitespace-pre-wrap break-all">
            {JSON.stringify(row, null, 2)}
          </pre>
        )}
      </div>

      {/* Actions */}
      {actions && actions.length > 0 && (
        <div className="border-t border-white/10 px-4 py-3 space-y-2">
          {actions.map((action) => (
            <button
              key={action.id}
              className="w-full h-8 rounded-lg bg-white/5 border border-white/10 text-xs font-medium text-muted-foreground hover:bg-white/10 hover:text-white transition-colors"
              onClick={() => onAction?.(action.id, row)}
              type="button"
            >
              {action.name}
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERACTIVE FORM VIEW
// ─────────────────────────────────────────────────────────────────────────────

export function InteractiveFormView({
  view,
  data,
  onSubmit,
}: {
  view?: ViewSpec;
  data: any;
  onSubmit?: (values: Record<string, any>) => void;
}) {
  const schema = React.useMemo((): Array<{ key: string; label: string; type: string; defaultValue?: any }> => {
    // Try to infer form fields from data, view.fields, or inputSchema
    if (view?.fields && view.fields.length > 0) {
      return view.fields.map((f) => ({ key: f, label: f, type: inferFieldType(f, data?.[f]) }));
    }
    if (data && typeof data === "object" && !Array.isArray(data)) {
      return Object.entries(data).map(([k, v]) => ({
        key: k,
        label: k,
        type: inferFieldType(k, v),
        defaultValue: v,
      }));
    }
    return [];
  }, [view?.fields, data]);

  const [values, setValues] = React.useState<Record<string, any>>(() => {
    const initial: Record<string, any> = {};
    for (const field of schema) {
      initial[field.key] = field.defaultValue ?? "";
    }
    return initial;
  });
  const [submitted, setSubmitted] = React.useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit?.(values);
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 2000);
  };

  if (schema.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm p-8">
        <AlertCircle className="w-12 h-12 mb-4 opacity-20" />
        <p>No form fields defined.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto">
      <form onSubmit={handleSubmit} className="flex-1 overflow-auto space-y-5 p-1">
        {schema.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <label className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
              {field.label}
            </label>
            {field.type === "textarea" ? (
              <textarea
                value={String(values[field.key] ?? "")}
                onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                rows={4}
                className="w-full rounded-lg bg-white/5 border border-white/10 text-sm text-white px-3 py-2.5 placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40 transition-all resize-none"
                placeholder={`Enter ${field.label}...`}
              />
            ) : field.type === "boolean" ? (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setValues((prev) => ({ ...prev, [field.key]: !prev[field.key] }))}
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    values[field.key] ? "bg-primary" : "bg-white/10"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                      values[field.key] ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
                <span className="text-sm text-foreground/80">
                  {values[field.key] ? "Yes" : "No"}
                </span>
              </div>
            ) : field.type === "number" ? (
              <input
                type="number"
                value={values[field.key] ?? ""}
                onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value ? Number(e.target.value) : "" }))}
                className="w-full h-10 rounded-lg bg-white/5 border border-white/10 text-sm text-white px-3 placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40 transition-all font-mono tabular-nums"
                placeholder={`Enter ${field.label}...`}
              />
            ) : field.type === "select" ? (
              <select
                value={String(values[field.key] ?? "")}
                onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                className="w-full h-10 rounded-lg bg-white/5 border border-white/10 text-sm text-white px-3 focus:outline-none focus:ring-1 focus:ring-primary/30 cursor-pointer"
              >
                <option value="">Select...</option>
                {(field.defaultValue && Array.isArray(field.defaultValue) ? field.defaultValue : []).map((opt: string) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : (
              <input
                type={field.type === "email" ? "email" : field.type === "url" ? "url" : "text"}
                value={String(values[field.key] ?? "")}
                onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                className="w-full h-10 rounded-lg bg-white/5 border border-white/10 text-sm text-white px-3 placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40 transition-all"
                placeholder={`Enter ${field.label}...`}
              />
            )}
          </div>
        ))}
      </form>

      {/* Submit bar */}
      <div className="border-t border-white/10 pt-4 mt-4 flex items-center gap-3">
        <button
          onClick={(e) => handleSubmit(e)}
          className={`h-10 px-6 rounded-lg text-sm font-medium transition-all ${
            submitted
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          }`}
          type="button"
        >
          {submitted ? (
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              Submitted
            </span>
          ) : (
            "Submit"
          )}
        </button>
        <button
          onClick={() => {
            const reset: Record<string, any> = {};
            for (const field of schema) reset[field.key] = field.defaultValue ?? "";
            setValues(reset);
          }}
          className="h-10 px-4 rounded-lg text-sm font-medium text-muted-foreground hover:text-white hover:bg-white/5 transition-colors"
          type="button"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERACTIVE INSPECTOR VIEW
// ─────────────────────────────────────────────────────────────────────────────

export function InteractiveInspectorView({
  data,
  onSelectRow,
}: {
  data: any;
  onSelectRow?: (row: Record<string, any>) => void;
}) {
  const [expandedPaths, setExpandedPaths] = React.useState<Set<string>>(new Set([""]));
  const [search, setSearch] = React.useState("");
  const [copiedPath, setCopiedPath] = React.useState<string | null>(null);

  const togglePath = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const copyPath = (path: string, value: any) => {
    navigator.clipboard.writeText(typeof value === "object" ? JSON.stringify(value, null, 2) : String(value));
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 1500);
  };

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm p-8">
        <AlertCircle className="w-12 h-12 mb-4 opacity-20" />
        <p>No data to inspect.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search keys or values..."
          className="w-full h-9 pl-9 pr-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40 transition-all"
        />
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-auto rounded-xl border border-white/5 bg-black/20 font-mono text-xs p-3">
        <InspectorNode
          data={data}
          path=""
          expandedPaths={expandedPaths}
          onToggle={togglePath}
          search={search}
          copiedPath={copiedPath}
          onCopy={copyPath}
          onSelect={onSelectRow}
          depth={0}
        />
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 mt-3 text-[10px] text-muted-foreground/40">
        <span>Type: {Array.isArray(data) ? "Array" : typeof data}</span>
        {Array.isArray(data) && <span>{data.length} items</span>}
        {typeof data === "object" && !Array.isArray(data) && <span>{Object.keys(data).length} keys</span>}
      </div>
    </div>
  );
}

function InspectorNode({
  data,
  path,
  expandedPaths,
  onToggle,
  search,
  copiedPath,
  onCopy,
  onSelect,
  depth,
}: {
  data: any;
  path: string;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
  search: string;
  copiedPath: string | null;
  onCopy: (path: string, value: any) => void;
  onSelect?: (row: Record<string, any>) => void;
  depth: number;
}) {
  const isExpanded = expandedPaths.has(path);
  const isObject = data !== null && typeof data === "object";
  const isArray = Array.isArray(data);

  if (!isObject) {
    const str = String(data);
    const isMatch = search && str.toLowerCase().includes(search.toLowerCase());
    return (
      <span className={`${
        typeof data === "string"
          ? "text-emerald-400"
          : typeof data === "number"
          ? "text-blue-400"
          : typeof data === "boolean"
          ? "text-amber-400"
          : data === null
          ? "text-muted-foreground/40"
          : "text-foreground/70"
      } ${isMatch ? "bg-amber-500/20 rounded px-0.5" : ""}`}>
        {typeof data === "string" ? `"${str.length > 120 ? str.slice(0, 120) + "…" : str}"` : str}
      </span>
    );
  }

  const entries: [string, any][] = isArray ? data.map((v: any, i: number) => [String(i), v]) : Object.entries(data);
  const filteredEntries = search
    ? entries.filter(([k, v]) => {
        const keyMatch = k.toLowerCase().includes(search.toLowerCase());
        const valMatch = String(v ?? "").toLowerCase().includes(search.toLowerCase());
        return keyMatch || valMatch;
      })
    : entries;

  const bracket = isArray ? ["[", "]"] : ["{", "}"];

  return (
    <div style={{ marginLeft: depth > 0 ? 16 : 0 }}>
      <div className="flex items-center gap-1 group/node hover:bg-white/[0.03] rounded px-1 -mx-1">
        <button
          onClick={() => onToggle(path)}
          className="h-4 w-4 flex items-center justify-center shrink-0"
          type="button"
        >
          <ChevronDown
            className={`w-3 h-3 text-muted-foreground/40 transition-transform ${isExpanded ? "" : "-rotate-90"}`}
          />
        </button>
        <span className="text-muted-foreground/40">
          {bracket[0]}
          {!isExpanded && (
            <span className="text-muted-foreground/30">
              {isArray ? `${data.length} items` : `${Object.keys(data).length} keys`}
            </span>
          )}
          {!isExpanded && bracket[1]}
        </span>
        <button
          onClick={() => onCopy(path, data)}
          className="ml-1 opacity-0 group-hover/node:opacity-100 transition-opacity"
          type="button"
        >
          {copiedPath === path ? (
            <Check className="w-3 h-3 text-emerald-400" />
          ) : (
            <Copy className="w-3 h-3 text-muted-foreground/30" />
          )}
        </button>
      </div>

      {isExpanded && (
        <>
          {filteredEntries.map(([key, value]) => {
            const childPath = path ? `${path}.${key}` : key;
            const isChildObject = value !== null && typeof value === "object";
            const keyMatch = search && key.toLowerCase().includes(search.toLowerCase());

            return (
              <div key={key} className="flex items-start gap-1" style={{ marginLeft: 16 }}>
                <span
                  className={`text-purple-400 shrink-0 cursor-pointer hover:text-purple-300 ${keyMatch ? "bg-amber-500/20 rounded px-0.5" : ""}`}
                  onClick={() => {
                    if (isChildObject && onSelect) onSelect(value);
                  }}
                >
                  {isArray ? key : `"${key}"`}
                </span>
                <span className="text-muted-foreground/30">: </span>
                {isChildObject ? (
                  <InspectorNode
                    data={value}
                    path={childPath}
                    expandedPaths={expandedPaths}
                    onToggle={onToggle}
                    search={search}
                    copiedPath={copiedPath}
                    onCopy={onCopy}
                    onSelect={onSelect}
                    depth={depth + 1}
                  />
                ) : (
                  <InspectorNode
                    data={value}
                    path={childPath}
                    expandedPaths={expandedPaths}
                    onToggle={onToggle}
                    search={search}
                    copiedPath={copiedPath}
                    onCopy={onCopy}
                    depth={depth + 1}
                  />
                )}
              </div>
            );
          })}
          <div style={{ marginLeft: 16 }}>
            <span className="text-muted-foreground/40">{bracket[1]}</span>
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERACTIVE COMMAND VIEW
// ─────────────────────────────────────────────────────────────────────────────

export function InteractiveCommandView({
  data,
  onExecute,
}: {
  data: any;
  onExecute?: (command: string, args: Record<string, any>) => void;
}) {
  const [inputValue, setInputValue] = React.useState("");
  const [history, setHistory] = React.useState<Array<{ type: "input" | "output"; content: string; timestamp: Date }>>([]);
  const [historyIdx, setHistoryIdx] = React.useState(-1);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Auto-populate initial data as first output
  React.useEffect(() => {
    if (data) {
      const content = typeof data === "string" ? data : JSON.stringify(data, null, 2);
      setHistory([{ type: "output", content, timestamp: new Date() }]);
    }
  }, [data]);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const command = inputValue.trim();
    const parts = command.split(/\s+/);
    const cmd = parts[0];
    const args: Record<string, any> = {};
    for (let i = 1; i < parts.length; i++) {
      if (parts[i].startsWith("--")) {
        const key = parts[i].replace(/^--/, "");
        args[key] = parts[i + 1] ?? true;
        if (typeof args[key] !== "boolean") i++;
      } else {
        args[`arg${i}`] = parts[i];
      }
    }

    setHistory((prev) => [
      ...prev,
      { type: "input", content: command, timestamp: new Date() },
    ]);
    setInputValue("");
    setHistoryIdx(-1);

    if (onExecute) {
      onExecute(cmd, args);
      // Simulate response
      setTimeout(() => {
        setHistory((prev) => [
          ...prev,
          { type: "output", content: `Executing: ${cmd} ${JSON.stringify(args)}`, timestamp: new Date() },
        ]);
      }, 200);
    } else {
      setHistory((prev) => [
        ...prev,
        { type: "output", content: `Command "${cmd}" dispatched. No handler connected.`, timestamp: new Date() },
      ]);
    }
  };

  const inputHistory = history.filter((h) => h.type === "input").map((h) => h.content);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const newIdx = Math.min(historyIdx + 1, inputHistory.length - 1);
      setHistoryIdx(newIdx);
      if (inputHistory.length > 0) {
        setInputValue(inputHistory[inputHistory.length - 1 - newIdx] ?? "");
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const newIdx = Math.max(historyIdx - 1, -1);
      setHistoryIdx(newIdx);
      if (newIdx === -1) {
        setInputValue("");
      } else {
        setInputValue(inputHistory[inputHistory.length - 1 - newIdx] ?? "");
      }
    }
  };

  return (
    <div className="flex flex-col h-full" onClick={() => inputRef.current?.focus()}>
      {/* Terminal output */}
      <div className="flex-1 overflow-auto rounded-xl border border-white/5 bg-black/40 font-mono text-xs p-4 space-y-2">
        {history.length === 0 ? (
          <div className="text-muted-foreground/30">
            <p>Welcome to the command interface.</p>
            <p>Type a command and press Enter to execute.</p>
          </div>
        ) : (
          history.map((entry, i) => (
            <div key={i}>
              {entry.type === "input" ? (
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400 shrink-0">$</span>
                  <span className="text-white">{entry.content}</span>
                </div>
              ) : (
                <pre className="text-muted-foreground/70 whitespace-pre-wrap pl-5 leading-relaxed">
                  {entry.content}
                </pre>
              )}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="mt-3">
        <div className="flex items-center gap-2 rounded-lg bg-black/40 border border-white/10 px-3 py-2 focus-within:border-primary/40 transition-colors">
          <span className="text-emerald-400 font-mono text-sm shrink-0">$</span>
          <input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            className="flex-1 bg-transparent text-sm text-white font-mono placeholder:text-muted-foreground/30 focus:outline-none"
            autoFocus
          />
          <span className="text-[10px] text-muted-foreground/30">Enter to run</span>
        </div>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERACTIVE DASHBOARD VIEW (Summary)
// ─────────────────────────────────────────────────────────────────────────────

export function InteractiveDashboardView({
  view,
  data,
  onSelectRow,
}: {
  view?: ViewSpec;
  data: any;
  onSelectRow?: (row: Record<string, any>) => void;
}) {
  // Auto-detect dashboard sections from data shape
  const sections = React.useMemo((): Array<{ type: "kpi" | "metrics" | "summary" | "list"; key: string; data: any }> => {
    if (!data) return [];
    if (Array.isArray(data)) {
      // Array of items → show as list
      return [{ type: "list", key: "Items", data }];
    }
    if (typeof data === "object") {
      const result: Array<{ type: "kpi" | "metrics" | "summary" | "list"; key: string; data: any }> = [];
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === "number" || typeof value === "string") {
          result.push({ type: "kpi", key, data: value });
        } else if (Array.isArray(value)) {
          result.push({ type: "list", key, data: value });
        } else if (typeof value === "object" && value !== null) {
          result.push({ type: "summary", key, data: value });
        }
      }
      return result;
    }
    return [];
  }, [data]);

  if (sections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm p-8">
        <AlertCircle className="w-12 h-12 mb-4 opacity-20" />
        <p>No dashboard data available.</p>
      </div>
    );
  }

  // Extract KPI sections
  const kpis = sections.filter((s) => s.type === "kpi");
  const lists = sections.filter((s) => s.type === "list");
  const summaries = sections.filter((s) => s.type === "summary");

  return (
    <div className="flex flex-col h-full overflow-auto space-y-6">
      {/* KPI Row */}
      {kpis.length > 0 && (
        <div className={`grid gap-4 ${kpis.length <= 2 ? "grid-cols-2" : kpis.length <= 4 ? "grid-cols-4" : "grid-cols-3 lg:grid-cols-5"}`}>
          {kpis.map(({ key, data: value }) => (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-white/5 bg-white/[0.02] p-4 hover:bg-white/[0.04] transition-colors"
            >
              <div className="text-[10px] text-muted-foreground/50 uppercase tracking-wider mb-1">{key}</div>
              <div className="text-2xl font-bold text-white tabular-nums">
                {typeof value === "number" ? value.toLocaleString() : value}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Summary sections */}
      {summaries.map(({ key, data: value }) => (
        <motion.div
          key={key}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-white/5 bg-white/[0.01]">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{key}</h3>
          </div>
          <div className="p-4 space-y-2">
            {Object.entries(value).map(([k, v]) => (
              <div key={k} className="flex items-start justify-between gap-4 py-1.5 border-b border-white/5 last:border-b-0">
                <span className="text-xs text-muted-foreground/60">{k}</span>
                <span className="text-sm text-white font-medium text-right">
                  {typeof v === "object" ? JSON.stringify(v) : String(v ?? "—")}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      ))}

      {/* List sections */}
      {lists.map(({ key, data: items }) => (
        <motion.div
          key={key}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-white/5 bg-white/[0.01] flex items-center justify-between">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{key}</h3>
            <span className="text-[10px] text-muted-foreground/40 tabular-nums">{items.length} items</span>
          </div>
          <div className="max-h-80 overflow-auto divide-y divide-white/5">
            {items.slice(0, 50).map((item: any, i: number) => {
              const title = item.title ?? item.name ?? item.label ?? item.message ?? String(Object.values(item)[0] ?? `Item ${i + 1}`);
              const subtitle = item.description ?? item.status ?? item.type ?? null;

              return (
                <div
                  key={i}
                  className="px-4 py-3 hover:bg-white/[0.03] transition-colors cursor-pointer flex items-center gap-3"
                  onClick={() => onSelectRow?.(typeof item === "object" ? item : { value: item })}
                >
                  <div className="h-7 w-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-[10px] text-muted-foreground/40 font-mono shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{typeof item === "object" ? title : String(item)}</div>
                    {subtitle && typeof item === "object" && (
                      <div className="text-[11px] text-muted-foreground/50 truncate mt-0.5">{subtitle}</div>
                    )}
                  </div>
                  {item.status && <StatusBadge value={String(item.status)} />}
                </div>
              );
            })}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function inferFieldType(key: string, value: any): string {
  const lower = key.toLowerCase();
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (lower.includes("description") || lower.includes("body") || lower.includes("content") || lower.includes("note"))
    return "textarea";
  if (lower.includes("email")) return "email";
  if (lower.includes("url") || lower.includes("link") || lower.includes("website")) return "url";
  if (Array.isArray(value)) return "select";
  return "text";
}

function normalizeRows(view: ViewSpec | undefined, data: any): Record<string, any>[] {
  if (Array.isArray(data)) return data;
  if (view?.source?.statePath && data?.[view.source.statePath]) return data[view.source.statePath];
  if (data && typeof data === "object") return (Object.values(data).find(Array.isArray) as any[]) ?? [];
  return [];
}

/** Convert camelCase/snake_case field names to human-readable column headers */
function humanizeColumnName(name: string): string {
  const DISPLAY_MAP: Record<string, string> = {
    id: "ID",
    url: "URL",
    html_url: "Link",
    web_url: "Link",
    created_at: "Created",
    updated_at: "Updated",
    closed_at: "Closed",
    merged_at: "Merged",
    due_on: "Due Date",
    due_date: "Due Date",
    dueDate: "Due Date",
    startTime: "Start Time",
    start_time: "Start Time",
    joinUrl: "Join URL",
    join_url: "Join URL",
    fullName: "Full Name",
    full_name: "Full Name",
    firstName: "First Name",
    lastName: "Last Name",
    lastEdited: "Last Edited",
    lastContact: "Last Contact",
    isRead: "Read Status",
    is_read: "Read Status",
    closeDate: "Close Date",
    pr: "Pull Request",
    sha: "Commit SHA",
    assignee: "Assigned To",
    assignees: "Assigned To",
    reviewers: "Reviewers",
    bodyPreview: "Preview",
    body_preview: "Preview",
    receivedDateTime: "Received",
    receiveddatetime: "Received",
    createdDateTime: "Created",
    createddatetime: "Created",
    sourceIntegration: "Source",
    source_integration: "Source",
    sourceType: "Source Type",
    integrationId: "Integration",
    created: "Created",
    updated: "Updated",
    date: "Date",
    title: "Title",
    name: "Name",
    status: "Status",
    state: "State",
    priority: "Priority",
    description: "Description",
    email: "Email",
    labels: "Labels",
    author: "Author",
    message: "Message",
    subject: "Subject",
    snippet: "Snippet",
    repository: "Repository",
    project: "Project",
    milestone: "Milestone",
    comments: "Comments",
    from: "From",
    to: "To",
    topic: "Topic",
    duration: "Duration",
    amount: "Amount",
    currency: "Currency",
    customer: "Customer",
    plan: "Plan",
    stage: "Stage",
    pipeline: "Pipeline",
    domain: "Domain",
    industry: "Industry",
    company: "Company",
    phone: "Phone",
    owner: "Owner",
    type: "Type",
    completed: "Completed",
    section: "Section",
    projects: "Projects",
    slug: "Slug",
    language: "Language",
    stars: "Stars",
    balance: "Balance",
  };
  if (DISPLAY_MAP[name]) return DISPLAY_MAP[name];

  // Split camelCase and snake_case
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
}

function page_key(item: any, fallbackIdx: number): number {
  return item.id ? hashCode(String(item.id)) : fallbackIdx;
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}

function globalIndex(group: string, i: number): number {
  return hashCode(group) + i;
}
