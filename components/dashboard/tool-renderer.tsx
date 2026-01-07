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

import { executeToolAction } from "@/app/actions/execute-action";

interface ToolRendererProps {
  toolId: string;
  spec: DashboardSpec;
  executionResults?: Record<string, ExecutionResult>;
  isLoading?: boolean;
}

export function ToolRenderer({ toolId, spec, executionResults = {}, isLoading }: ToolRendererProps) {
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

  // STRICT SEPARATION: Mini App vs Dashboard
  if (spec.kind === "mini_app") {
      return <MiniAppRuntime toolId={toolId} spec={spec} />;
  }

  // Dashboard Mode (Legacy)
  const hasLegacyViews = spec.views?.length > 0;
  
  // A tool has "real data" only if we have at least one successful execution result
  // AND views/components are defined.
  const hasRealData =
    hasLegacyViews &&
    Object.values(executionResults).some((r) => r.status === "success" && Array.isArray(r.rows) && r.rows.length > 0);
  
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
          {spec.views?.length > 0 && (
             <div className="mt-4 max-w-md text-xs text-red-500">
               {Object.values(executionResults).map(r => r.error).filter(Boolean).map((err, i) => (
                 <div key={i}>Error: {err}</div>
               ))}
             </div>
          )}
        </div>
      ) : (
        renderLegacyViews(spec, executionResults)
      )}
    </div>
  );
}

import { getComponent } from "./component-registry";

function MiniAppRuntime({ toolId, spec }: { toolId: string; spec: DashboardSpec }) {
  const [activePageId, setActivePageId] = React.useState<string | null>(null);
  const [toolState, setToolState] = React.useState(spec.state || {});
  const [isExecuting, setIsExecuting] = React.useState(false);

  // Initialize Page
  React.useEffect(() => {
    if (spec.pages?.length > 0 && !activePageId) {
      setActivePageId(spec.pages[0].id);
    }
  }, [spec, activePageId]);

  // Update state when spec changes
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

  const executeAction = React.useCallback(async (actionId: string, args?: Record<string, any>) => {
      const action = spec.actions?.find(a => a.id === actionId);
      if (!action) return;

      console.log("[MiniAppRuntime] Executing Action:", action.type, action.id, args);
      setIsExecuting(true);

      const runStep = async (type: string, config: any) => {
          if (type === "state_mutation") {
              const updates = config?.updates || {};
              const mergedUpdates = { ...updates, ...args };
              setToolState((prev: any) => ({ ...prev, ...mergedUpdates }));
          }
          
          if (type === "navigation") {
              if (config?.pageId) setActivePageId(config.pageId);
          }

          if (type === "integration_call") {
              // We use the actionId as the capability execution ID for now
              // In strict mode, config should have capabilityId and params
              const result = await executeToolAction(toolId, actionId, { ...config, ...args });
              if (result.status === "success") {
                  setToolState((prev: any) => ({ ...prev, [`${actionId}.data`]: result.rows }));
              } else {
                  console.error("Action execution returned error:", result.error);
                  setToolState((prev: any) => ({ ...prev, [`${actionId}.error`]: result.error }));
                  throw new Error(result.error); // Stop chain
              }
          }
      };

      try {
          // Multi-step support
          if (action.steps && action.steps.length > 0) {
              for (const step of action.steps) {
                  await runStep(step.type, step.config);
              }
          } else {
              // Legacy single-step fallback
              await runStep(action.type, action.config);
          }
      } catch (e) {
          console.error("Action execution failed:", e);
          setToolState((prev: any) => ({ ...prev, [`${actionId}.error`]: e instanceof Error ? e.message : "Unknown error" }));
      } finally {
          setIsExecuting(false);
      }
  }, [spec.actions, toolId]);

  // Event Handler
  const handleEvent = React.useCallback((eventName: string, args?: any) => {
      // Find the event definition on the component?
      // For now, we assume the component calls this with specific args.
      // But we need to know WHICH component triggered it to look up its events.
      // Refactor: handleEvent needs (componentId, eventName, args)
      console.warn("handleEvent called without component context");
  }, []);

  const handleComponentEvent = React.useCallback((componentId: string, eventName: string, args?: any) => {
      const activePage = spec.pages?.find(p => p.id === activePageId);
      const component = activePage?.components.find(c => c.id === componentId);
      if (!component) return;

      // 1. State Binding Update (Implicit)
      if (eventName === "onChange" && args?.bindKey) {
          setToolState((prev: any) => ({ ...prev, [args.bindKey]: args.value }));
      }

      // 2. Explicit Event Actions
      if (component.events) {
          const eventHandlers = component.events.filter(e => e.type === eventName);
          for (const handler of eventHandlers) {
              // Resolve args: if handler has args, merge them.
              const actionArgs = { ...(handler.args || {}), ...(args || {}) };
              executeAction(handler.actionId, actionArgs);
          }
      }
  }, [activePageId, spec.pages, executeAction]);

  const activePage = spec.pages?.find(p => p.id === activePageId);

  if (!activePage) {
      return <div className="p-6">No pages defined</div>;
  }

  return (
    <div className="h-full flex flex-col bg-background relative">
        {isExecuting && (
            <div className="absolute inset-0 bg-background/50 z-50 flex items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
        )}
        
        {/* App Header */}
        <div className="border-b px-6 py-4 flex items-center justify-between">
            <div>
                <h1 className="text-xl font-semibold">{spec.title}</h1>
                {spec.description && <p className="text-sm text-muted-foreground">{spec.description}</p>}
            </div>
            {spec.pages?.length > 1 && (
                <div className="flex gap-2">
                    {spec.pages.map(page => (
                        <button 
                            key={page.id}
                            onClick={() => setActivePageId(page.id)}
                            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${activePageId === page.id ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-muted text-muted-foreground'}`}
                        >
                            {page.name}
                        </button>
                    ))}
                </div>
            )}
        </div>

        {/* App Content */}
        <div className="flex-1 overflow-auto p-6">
             <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 max-w-6xl mx-auto">
                 {activePage.components.map(comp => {
                     try {
                         const Component = getComponent(comp.type);
                         return (
                             <div key={comp.id} className={comp.layout?.w ? `col-span-${Math.min(comp.layout.w, 4)}` : "col-span-1"}>
                                 <Component 
                                     component={comp} 
                                     state={toolState} 
                                     onEvent={(name, args) => handleComponentEvent(comp.id, name, args)}
                                 />
                             </div>
                         );
                     } catch (e) {
                         return (
                             <div key={comp.id} className="col-span-4 border border-red-200 bg-red-50 p-4 rounded-md text-red-600 text-sm">
                                 Error rendering {comp.type}: {e instanceof Error ? e.message : String(e)}
                             </div>
                         );
                     }
                 })}
             </div>
        </div>
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
