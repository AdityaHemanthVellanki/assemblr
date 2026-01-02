"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DashboardSpec } from "@/lib/spec/dashboardSpec";
import type { ExecutionResult } from "@/lib/execution/types";

interface ToolRendererProps {
  spec: DashboardSpec;
  executionResults?: Record<string, ExecutionResult>;
  isLoading?: boolean;
}

export function ToolRenderer({ spec, executionResults = {}, isLoading }: ToolRendererProps) {
  if (!spec) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        No tool specification found. Start chatting to build one.
      </div>
    );
  }

  // A tool has "real data" only if we have at least one successful execution result
  // AND views are defined.
  const hasRealData =
    spec.views.length > 0 &&
    Object.values(executionResults).some((r) => r.status === "success" && r.data && r.data.length > 0);

  return (
    <div className="h-full overflow-auto bg-muted/5 p-6">
      <div className="mb-8 space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{spec.title}</h1>
        {spec.description && (
          <p className="text-muted-foreground">{spec.description}</p>
        )}
      </div>

      {isLoading ? (
        <div className="flex h-[400px] flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p>Executing queries...</p>
        </div>
      ) : !hasRealData ? (
        <div className="flex h-[400px] flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <p className="mb-2 text-lg font-medium">No data yet</p>
          <p className="text-sm">
            Connect integrations and define queries to see real data.
          </p>
          {spec.views.length > 0 && (
             <div className="mt-4 max-w-md text-xs text-red-500">
               {Object.values(executionResults).map(r => r.error).filter(Boolean).map((err, i) => (
                 <div key={i}>Error: {err}</div>
               ))}
             </div>
          )}
        </div>
      ) : (
        <>
          {/* Metrics Grid */}
          <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {spec.views
              .filter((v) => v.type === "metric")
              .map((view) => {
                const metric = spec.metrics.find((m) => m.id === view.metricId);
                const result = executionResults[view.id];
                
                if (!metric) return null;

                let displayValue = "-";
                if (result?.status === "success" && result.data) {
                  // Naive aggregation: count rows
                  // For "sum", we need to sum the field.
                  // But the Executor currently returns raw rows.
                  // We should aggregate here or in Executor. 
                  // For Phase 1 execution, let's just count rows for "count"
                  // and show "N/A" for sum unless we parse it.
                  
                  if (metric.type === "count") {
                    displayValue = result.data.length.toLocaleString();
                  } else if (metric.type === "sum" && metric.field) {
                    // Try to sum
                    const sum = result.data.reduce((acc, row) => {
                      const val = (row as Record<string, unknown>)[metric.field!];
                      return acc + (Number(val) || 0);
                    }, 0);
                    displayValue = sum.toLocaleString();
                  }
                }

                return (
                  <Card key={view.id} className={result?.status === "error" ? "border-red-200 bg-red-50" : ""}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">
                        {metric.label}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{displayValue}</div>
                      {result?.status === "error" && (
                         <p className="text-xs text-red-500 mt-1">{result.error}</p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
          </div>

          {/* Charts & Tables */}
          <div className="grid gap-4 md:grid-cols-2">
            {spec.views
              .filter((v) => v.type !== "metric")
              .map((view) => {
                const metric = spec.metrics.find((m) => m.id === view.metricId);
                const result = executionResults[view.id];
                const data = (result?.status === "success" ? result.data : []) as any[];

                if (view.type === "table") {
                  return (
                    <Card key={view.id} className="col-span-2">
                      <CardHeader>
                        <CardTitle>Data: {view.table || "Unknown"}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {result?.status === "error" ? (
                          <div className="text-red-500">Error: {result.error}</div>
                        ) : (
                          <div className="max-h-[400px] overflow-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  {data.length > 0 && Object.keys(data[0]).slice(0, 5).map(key => (
                                    <TableHead key={key}>{key}</TableHead>
                                  ))}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {data.slice(0, 20).map((row, i) => (
                                  <TableRow key={i}>
                                     {Object.keys(row).slice(0, 5).map(key => (
                                       <TableCell key={key}>
                                         {typeof row[key] === 'object' ? JSON.stringify(row[key]) : String(row[key])}
                                       </TableCell>
                                     ))}
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                }

                if (!metric) return null;

                // Charts
                // We need to group data by day if groupBy is set
                // For now, let's just dump the raw data if it has a date field?
                // Or show placeholder if complex aggregation needed.
                // Strict rule: "No fake charts".
                // If we can't map it, show empty.
                
                // Try to find a date field
                const dateField = Object.keys(data[0] || {}).find(k => k.toLowerCase().includes("date") || k.toLowerCase().includes("time") || k === "created_at");
                
                return (
                  <Card key={view.id} className="col-span-1">
                    <CardHeader>
                      <CardTitle>{metric.label}</CardTitle>
                    </CardHeader>
                    <CardContent className="pl-2">
                      <div className="h-[300px] w-full">
                         {result?.status === "error" ? (
                            <div className="flex h-full items-center justify-center text-red-500">
                              {result.error}
                            </div>
                         ) : data.length === 0 ? (
                            <div className="flex h-full items-center justify-center text-muted-foreground">
                              No data
                            </div>
                         ) : !dateField ? (
                            <div className="flex h-full items-center justify-center text-muted-foreground">
                              Cannot chart data: No date field found
                            </div>
                         ) : (
                           <ResponsiveContainer width="100%" height="100%">
                             {view.type === "bar_chart" ? (
                               <BarChart data={data}>
                                 <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                 <XAxis
                                   dataKey={dateField}
                                   stroke="#888888"
                                   fontSize={12}
                                   tickLine={false}
                                   axisLine={false}
                                   tickFormatter={(v) => new Date(v).toLocaleDateString()}
                                 />
                                 <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                                 <Tooltip />
                                 <Bar dataKey={metric.field || "count"} fill="currentColor" radius={[4, 4, 0, 0]} className="fill-primary" />
                               </BarChart>
                             ) : (
                               <LineChart data={data}>
                                 <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                 <XAxis
                                   dataKey={dateField}
                                   stroke="#888888"
                                   fontSize={12}
                                   tickLine={false}
                                   axisLine={false}
                                   tickFormatter={(v) => new Date(v).toLocaleDateString()}
                                 />
                                 <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                                 <Tooltip />
                                 <Line type="monotone" dataKey={metric.field || "count"} stroke="currentColor" strokeWidth={2} dot={false} className="stroke-primary" />
                               </LineChart>
                             )}
                           </ResponsiveContainer>
                         )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        </>
      )}
    </div>
  );
}
