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
  // Support for Multi-Page Tools
  const [activePageId, setActivePageId] = React.useState<string | null>(null);
  const [toolState, setToolState] = React.useState(spec.state || {});

  // Update state when spec changes (only if keys are missing)
  React.useEffect(() => {
    if (spec.state) {
      setToolState(prev => {
        const next = { ...prev };
        let changed = false;
        for (const [k, v] of Object.entries(spec.state)) {
          if (!(k in next)) {
            next[k] = v;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }
  }, [spec.state]);

  const executeAction = React.useCallback(async (actionId?: string, args?: Record<string, any>) => {
      if (!actionId) return;
      const action = spec.actions?.find(a => a.id === actionId);
      if (!action) return;

      console.log("Executing Action:", action.type, action.id, args);

      if (action.type === "state_mutation") {
          const updates = action.config?.updates || {};
          // Merge args into updates if needed
          const mergedUpdates = { ...updates, ...args };
          setToolState((prev: any) => ({ ...prev, ...mergedUpdates }));
      }
      
      if (action.type === "navigation") {
          if (action.config?.pageId) setActivePageId(action.config.pageId);
      }

      if (action.type === "integration_call") {
          // TODO: This needs to call the engine. 
          // For now, we simulate by updating state if the action expects output
          // In a real implementation, this would trigger a useQuery re-fetch or mutation
          console.warn("Integration calls require engine connectivity");
      }
  }, [spec.actions]);

  React.useEffect(() => {
    if (spec?.pages?.length > 0 && !activePageId) {
      setActivePageId(spec.pages[0].id);
    }
  }, [spec, activePageId]);

  if (!spec) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        No tool specification found. Start chatting to build one.
      </div>
    );
  }

  // Legacy View Support
  const hasLegacyViews = spec.views?.length > 0 && (!spec.pages || spec.pages.length === 0);
  const activePage = spec.pages?.find(p => p.id === activePageId);

  // A tool has "real data" only if we have at least one successful execution result
  // AND views/components are defined.
  const hasRealData =
    (hasLegacyViews || (activePage?.components && activePage.components.length > 0)) &&
    Object.values(executionResults).some((r) => r.status === "success" && Array.isArray(r.rows) && r.rows.length > 0);
  
  // Render Content
  const renderContent = () => {
     if (hasLegacyViews) {
         return renderLegacyViews(spec, executionResults);
     }
     if (activePage) {
         return (
             <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                 {activePage.components.map(comp => {
                    // Basic Component Rendering
                     if (comp.type === "button") {
                          const onClickAction = comp.events?.find(a => a.type === "onClick")?.actionId;
                          return (
                              <div key={comp.id} className="col-span-1">
                                  <button 
                                      onClick={() => executeAction(onClickAction)}
                                      className="bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2 inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                                  >
                                      {comp.label || "Button"}
                                  </button>
                              </div>
                          )
                      }
                     if (comp.type === "text") {
                         // Simple interpolation
                         let content = String(comp.properties?.content || comp.label || "");
                         content = content.replace(/{{(.*?)}}/g, (_, key) => toolState[key.trim()] || "");
                         
                         return (
                             <div key={comp.id} className="col-span-4 prose dark:prose-invert">
                                 {content}
                             </div>
                         )
                      }
                      if (comp.type === "select") {
                          const bindKey = comp.dataSource?.type === "state" ? comp.dataSource.value : undefined;
                          const options = comp.properties?.options || []; // [{ label, value }]
                          return (
                              <div key={comp.id} className="col-span-1 space-y-2">
                                  <label className="text-sm font-medium leading-none">{comp.label}</label>
                                  <select 
                                      className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                      value={bindKey ? toolState[bindKey] || "" : undefined}
                                      onChange={(e) => {
                                          if (bindKey) setToolState((prev: any) => ({ ...prev, [bindKey]: e.target.value }));
                                      }}
                                  >
                                      <option value="" disabled>Select an option</option>
                                      {options.map((opt: any) => (
                                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                                      ))}
                                  </select>
                              </div>
                          )
                      }
                      if (comp.type === "input") {
                         const bindKey = comp.dataSource?.type === "state" ? comp.dataSource.value : undefined;
                         return (
                             <div key={comp.id} className="col-span-1 space-y-2">
                                 <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                     {comp.label}
                                 </label>
                                 <input 
                                     className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                     placeholder={String(comp.properties?.placeholder || "")}
                                     value={bindKey ? toolState[bindKey] || "" : undefined}
                                     onChange={(e) => {
                                         if (bindKey) setToolState((prev: any) => ({ ...prev, [bindKey]: e.target.value }));
                                     }}
                                 />
                             </div>
                         )
                     }
                    // Fallback
                    return (
                        <div key={comp.id} className="col-span-4 border p-4 rounded-md">
                            <div className="font-bold mb-2">{comp.type}: {comp.label || comp.id}</div>
                            <pre className="text-xs overflow-auto max-h-40">{JSON.stringify(comp, null, 2)}</pre>
                        </div>
                    );
                 })}
             </div>
         );
     }
     return <div>No pages defined</div>;
  };

  return (
    <div className="h-full overflow-auto bg-muted/5 p-6">
      <div className="mb-8 space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{spec.title}</h1>
        {spec.description && (
          <p className="text-muted-foreground">{spec.description}</p>
        )}
        {spec.pages?.length > 1 && (
            <div className="flex gap-2 mt-4">
                {spec.pages.map(page => (
                    <button 
                        key={page.id}
                        onClick={() => setActivePageId(page.id)}
                        className={`px-3 py-1 text-sm rounded-md ${activePageId === page.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                    >
                        {page.name}
                    </button>
                ))}
            </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex h-[400px] flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p>Executing queries...</p>
        </div>
      ) : !hasRealData && !activePage ? (
        <div className="flex h-[400px] flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <p className="mb-2 text-lg font-medium">No data yet</p>
          <p className="text-sm">
            Connect integrations and define queries to see real data.
          </p>
          {(spec.views?.length > 0 || spec.pages?.length > 0) && (
             <div className="mt-4 max-w-md text-xs text-red-500">
               {Object.values(executionResults).map(r => r.error).filter(Boolean).map((err, i) => (
                 <div key={i}>Error: {err}</div>
               ))}
             </div>
          )}
        </div>
      ) : (
        renderContent()
      )}
    </div>
  );
}

export function renderLegacyViews(spec: DashboardSpec, executionResults: Record<string, ExecutionResult>) {
  return (
    <>
      {/* Metrics Grid */}
      <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {spec.views
          .filter((v) => v.type === "metric")
              .map((view) => {
                const metric = spec.metrics.find((m) => m.id === view.metricId);
                const result = executionResults[view.id];
                const rows = (result?.status === "success" && Array.isArray(result.rows)) ? result.rows : [];
                
                if (!metric) return null;

                let displayValue = "-";
                if (result?.status === "success" && rows.length > 0) {
                  // Naive aggregation: count rows
                  // For "sum", we need to sum the field.
                  // But the Executor currently returns raw rows.
                  // We should aggregate here or in Executor. 
                  // For Phase 1 execution, let's just count rows for "count"
                  // and show "N/A" for sum unless we parse it.
                  
                  if (metric.type === "count") {
                    displayValue = rows.length.toLocaleString();
                  } else if (metric.type === "sum" && metric.field) {
                    // Try to sum
                    const sum = rows.reduce((acc: number, row) => {
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
                const rows = (result?.status === "success" && Array.isArray(result.rows)) ? result.rows : [];

                if (view.type === "query") {
                  const kind = (view as any).presentation?.kind as "list" | "card" | "timeline" | undefined;
                  return (
                    <Card key={view.id} className="col-span-2">
                      <CardHeader>
                        <CardTitle>
                          Query: {(view as any).capability}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {result?.status === "error" ? (
                          <div className="text-red-500">Error: {result.error}</div>
                        ) : rows.length === 0 ? (
                          <div className="text-muted-foreground">No data</div>
                        ) : kind === "card" ? (
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            {rows.slice(0, 8).map((row, i) => (
                              <div key={i} className="rounded-md border p-3">
                                {Object.entries(row as Record<string, unknown>).slice(0, 5).map(([k, v]) => (
                                  <div key={k} className="text-sm">
                                    <span className="font-medium">{k}:</span>{" "}
                                    <span className="text-muted-foreground">
                                      {typeof v === "object" ? JSON.stringify(v) : String(v)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        ) : kind === "timeline" ? (
                          <div className="space-y-3">
                            {rows
                              .slice(0, 20)
                              .sort((a: any, b: any) => {
                                const ak = Object.keys(a).find(k => String(k).toLowerCase().includes("date") || String(k).toLowerCase().includes("time")) as string | undefined;
                                const bk = Object.keys(b).find(k => String(k).toLowerCase().includes("date") || String(k).toLowerCase().includes("time")) as string | undefined;
                                const ad = ak ? new Date((a as any)[ak]).getTime() : 0;
                                const bd = bk ? new Date((b as any)[bk]).getTime() : 0;
                                return bd - ad;
                              })
                              .map((row, i) => (
                                <div key={i} className="relative pl-6">
                                  <div className="absolute left-0 top-2 h-2 w-2 rounded-full bg-primary" />
                                  <div className="rounded-md border p-3">
                                    {Object.entries(row as Record<string, unknown>).slice(0, 5).map(([k, v]) => (
                                      <div key={k} className="text-sm">
                                        <span className="font-medium">{k}:</span>{" "}
                                        <span className="text-muted-foreground">
                                          {typeof v === "object" ? JSON.stringify(v) : String(v)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                          </div>
                        ) : (
                          <div className="max-h-[400px] overflow-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  {rows.length > 0 && Object.keys(rows[0] as object).slice(0, 5).map(key => (
                                    <TableHead key={key}>{key}</TableHead>
                                  ))}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {rows.slice(0, 20).map((row, i) => (
                                  <TableRow key={i}>
                                     {Object.keys(row as object).slice(0, 5).map(key => (
                                       <TableCell key={key}>
                                         {typeof (row as any)[key] === 'object' ? JSON.stringify((row as any)[key]) : String((row as any)[key])}
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

                if (view.type === "heatmap") {
                  if (!metric) return null;
                  const dateField = rows.length > 0 ? Object.keys(rows[0] as object).find(k => k.toLowerCase().includes("date") || k.toLowerCase().includes("time") || k === "created_at") : undefined;
                  
                  // Aggregate by day
                  const dataByDay: Record<string, number> = {};
                  rows.forEach((row: any) => {
                    if (!dateField) return;
                    const date = new Date(row[dateField]);
                    if (isNaN(date.getTime())) return;
                    const day = date.toISOString().split("T")[0];
                    const val = metric.field ? (Number(row[metric.field]) || 0) : 1;
                    dataByDay[day] = (dataByDay[day] || 0) + val;
                  });

                  const sortedDays = Object.keys(dataByDay).sort();
                  const maxVal = Math.max(...Object.values(dataByDay), 1);

                  return (
                    <Card key={view.id} className="col-span-1">
                      <CardHeader>
                        <CardTitle>{metric.label}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {result?.status === "error" ? (
                           <div className="text-red-500">Error: {result.error}</div>
                        ) : !dateField ? (
                           <div className="text-muted-foreground">No date field found for heatmap</div>
                        ) : (
                           <div className="flex flex-wrap gap-1">
                             {sortedDays.map(day => {
                               const count = dataByDay[day];
                               const opacity = Math.max(0.1, count / maxVal);
                               return (
                                 <div 
                                   key={day} 
                                   className="h-3 w-3 rounded-[1px] bg-primary"
                                   style={{ opacity }}
                                   title={`${day}: ${count}`}
                                 />
                               );
                             })}
                             {sortedDays.length === 0 && <div className="text-muted-foreground">No data</div>}
                           </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                }

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
                                  {rows.length > 0 && Object.keys(rows[0] as object).slice(0, 5).map(key => (
                                    <TableHead key={key}>{key}</TableHead>
                                  ))}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {rows.slice(0, 20).map((row, i) => (
                                  <TableRow key={i}>
                                     {Object.keys(row as object).slice(0, 5).map(key => (
                                       <TableCell key={key}>
                                         {typeof (row as any)[key] === 'object' ? JSON.stringify((row as any)[key]) : String((row as any)[key])}
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
                const dateField = rows.length > 0 ? Object.keys(rows[0] as object).find(k => k.toLowerCase().includes("date") || k.toLowerCase().includes("time") || k === "created_at") : undefined;
                
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
                         ) : rows.length === 0 ? (
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
                               <BarChart data={rows}>
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
                               <LineChart data={rows}>
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
  );
}
