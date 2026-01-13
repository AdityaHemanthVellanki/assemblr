"use client";

import * as React from "react";
import { useSyncExternalStore } from "react";

import type { MiniAppSpec } from "@/lib/spec/miniAppSpec";
import { normalizeActionId } from "@/lib/spec/action-id";
import { ActionRegistry } from "@/lib/spec/action-registry";
import { getMiniAppComponent, type MiniAppComponentSpec } from "@/components/miniapp/components";
import { MINI_APP_COMPONENTS } from "@/components/miniapp/components";

type IntegrationResult = { status: "success"; rows: any[] } | { status: "error"; error: string };

export type MiniAppIntegrations = {
  call: (actionId: string, args: Record<string, any>) => Promise<IntegrationResult>;
};

type RuntimeSnapshot = {
  state: Record<string, any>;
  activePageId: string | null;
  runningActions: Array<{ actionId: string; startedAt: number }>;
  integrationCalls: Array<{ actionId: string; startedAt: number; args: Record<string, any>; status?: "success" | "error" }>;
  lastError: string | null;
};

function evaluateExpression(expression: any, ctx: { state: Record<string, any>; payload: Record<string, any>; results: Record<string, any> }): any {
  if (typeof expression !== "string") return expression;

  const exact = expression.match(/^{{\s*(state|payload|results)\.([a-zA-Z0-9_.$-]+)\s*}}$/);
  if (exact) {
    const [, root, key] = exact;
    const src = root === "state" ? ctx.state : root === "payload" ? ctx.payload : ctx.results;
    return src[key];
  }

  return expression.replace(/{{\s*(state|payload|results)\.([a-zA-Z0-9_.$-]+)\s*}}/g, (_, root, key) => {
    const src = root === "state" ? ctx.state : root === "payload" ? ctx.payload : ctx.results;
    const val = src[key];
    return val === undefined || val === null ? "" : String(val);
  });
}

function evaluateArgs(args: Record<string, any>, ctx: { state: Record<string, any>; payload: Record<string, any>; results: Record<string, any> }) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(args ?? {})) out[k] = evaluateExpression(v, ctx);
  return out;
}

function walkComponents(components: MiniAppComponentSpec[], fn: (c: MiniAppComponentSpec) => void) {
  for (const c of components) {
    fn(c);
    if (Array.isArray(c.children) && c.children.length) walkComponents(c.children, fn);
  }
}

export class MiniAppStore {
  private listeners = new Set<() => void>();
  private snapshot: RuntimeSnapshot;
  private resultsByActionId: Record<string, any> = {};
  private registry: ActionRegistry;

  constructor(private spec: MiniAppSpec, private integrations: MiniAppIntegrations, initialState: Record<string, any>) {
    // 1. Build Action Registry (Centralized)
    this.registry = new ActionRegistry(spec.actions ?? []);

    // 2. Validate All Event Bindings (Fail Fast)
    const validateEvent = (context: string, event: { actionId: string }) => {
      if (!event.actionId) return;
      this.registry.ensureExists(event.actionId, context);
    };

    // Check Lifecycle
    if (spec.lifecycle) {
      for (const e of spec.lifecycle.onLoad ?? []) validateEvent("Lifecycle.onLoad", e);
      for (const e of spec.lifecycle.onUnload ?? []) validateEvent("Lifecycle.onUnload", e);
      for (const e of spec.lifecycle.onInterval ?? []) validateEvent("Lifecycle.onInterval", e);
    }

    // Check Pages
    for (const page of spec.pages ?? []) {
      for (const e of page.events ?? []) validateEvent(`Page(${page.id})`, e);
      walkComponents((page.components ?? []) as any, (c) => {
         for (const e of c.events ?? []) validateEvent(`Component(${c.id})`, e);
      });
    }

    const baseState = {
      _trace: [],
      ...(spec.state ?? {}),
      ...(initialState ?? {}),
    } as Record<string, any>;
    const derived = this.computeDerivedPatch(baseState);
    this.snapshot = {
      state: { ...baseState, ...derived },
      activePageId: spec.pages?.[0]?.id ?? null,
      runningActions: [],
      integrationCalls: [],
      lastError: null,
    };
  }

  private computeDerivedPatch(state: Record<string, any>): Record<string, any> {
    const defs = state.__derivations;
    if (!Array.isArray(defs)) return {};
    const patch: Record<string, any> = {};
    for (const d of defs) {
      if (!d || typeof d !== "object") continue;
      const target = typeof d.target === "string" ? d.target : undefined;
      const source = typeof d.source === "string" ? d.source : undefined;
      const op = typeof d.op === "string" ? d.op : undefined;
      if (!target || !source || !op) continue;

      const srcVal = state[source];
      const srcArr = Array.isArray(srcVal) ? srcVal : [];
      const args = (d.args ?? {}) as Record<string, any>;

      if (op === "filter") {
        const field = typeof args.field === "string" ? args.field : undefined;
        if (!field) continue;
        const equalsKey = typeof args.equalsKey === "string" ? args.equalsKey : undefined;
        const includesKey = typeof args.includesKey === "string" ? args.includesKey : undefined;
        const equalsVal = equalsKey ? state[equalsKey] : args.equals;
        const includesVal = includesKey ? state[includesKey] : args.includes;
        patch[target] = srcArr.filter((it: any) => {
          const v = it && typeof it === "object" ? (it as any)[field] : undefined;
          if (includesVal != null && includesVal !== "") return String(v ?? "").includes(String(includesVal));
          if (equalsVal != null && equalsVal !== "") return String(v ?? "") === String(equalsVal);
          return true;
        });
        continue;
      }

      if (op === "sort") {
        const field = typeof args.field === "string" ? args.field : undefined;
        if (!field) continue;
        const dir = args.direction === "asc" || args.direction === "desc" ? args.direction : "asc";
        const next = [...srcArr];
        next.sort((a: any, b: any) => {
          const av = a && typeof a === "object" ? (a as any)[field] : undefined;
          const bv = b && typeof b === "object" ? (b as any)[field] : undefined;
          const na = typeof av === "number" ? av : Number.isFinite(Number(av)) ? Number(av) : null;
          const nb = typeof bv === "number" ? bv : Number.isFinite(Number(bv)) ? Number(bv) : null;
          let cmp = 0;
          if (na != null && nb != null) cmp = na - nb;
          else cmp = String(av ?? "").localeCompare(String(bv ?? ""));
          return dir === "asc" ? cmp : -cmp;
        });
        patch[target] = next;
        continue;
      }

      if (op === "map") {
        const pick = Array.isArray(args.pick) ? args.pick.filter((x: any) => typeof x === "string") : [];
        if (!pick.length) continue;
        patch[target] = srcArr.map((it: any) => {
          const out: Record<string, any> = {};
          for (const k of pick) out[k] = it && typeof it === "object" ? (it as any)[k] : undefined;
          return out;
        });
        continue;
      }

      if (op === "count") {
        patch[target] = srcArr.length;
        continue;
      }

      if (op === "groupByCount") {
        const field = typeof args.field === "string" ? args.field : undefined;
        if (!field) continue;
        const m = new Map<string, number>();
        for (const it of srcArr) {
          const v = it && typeof it === "object" ? (it as any)[field] : undefined;
          const k = String(v ?? "");
          m.set(k, (m.get(k) ?? 0) + 1);
        }
        patch[target] = Array.from(m.entries()).map(([key, count]) => ({ key, count }));
        continue;
      }

      if (op === "latest") {
        const byField = typeof args.byField === "string" ? args.byField : "timestamp";
        const next = [...srcArr];
        next.sort((a: any, b: any) => {
          const av = a && typeof a === "object" ? (a as any)[byField] : undefined;
          const bv = b && typeof b === "object" ? (b as any)[byField] : undefined;
          return String(bv ?? "").localeCompare(String(av ?? ""));
        });
        patch[target] = next[0] ?? null;
        continue;
      }

      if (op === "aggregateByDay") {
        const tsField = typeof args.timestampField === "string" ? args.timestampField : "timestamp";
        const m = new Map<string, number>();
        for (const it of srcArr) {
          const raw = it && typeof it === "object" ? (it as any)[tsField] : undefined;
          const d = raw instanceof Date ? raw : new Date(raw);
          if (Number.isNaN(d.getTime())) continue;
          const day = d.toISOString().slice(0, 10);
          m.set(day, (m.get(day) ?? 0) + 1);
        }
        patch[target] = Array.from(m.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([day, count]) => ({ day, count }));
        continue;
      }
    }
    return patch;
  }

  private addTrace(entry: { actionId: string; type: string; status: string; message?: string; data?: any }) {
    const trace = this.snapshot.state._trace || [];
    const newEntry = {
      id: Math.random().toString(36).slice(2),
      timestamp: Date.now(),
      ...entry,
    };
    const updatedTrace = [newEntry, ...trace].slice(0, 50);
    this.setState({ _trace: updatedTrace });
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  setState = (partial: Record<string, any>) => {
    if (!partial || typeof partial !== "object") return;
    const merged = { ...this.snapshot.state, ...partial };
    const derived = this.computeDerivedPatch(merged);
    this.snapshot = { ...this.snapshot, state: { ...merged, ...derived } };
    this.emit();
  };

  setActivePageId = (pageId: string) => {
    this.snapshot = { ...this.snapshot, activePageId: pageId };
    this.emit();
  };

  setError = (message: string | null) => {
    this.snapshot = { ...this.snapshot, lastError: message };
    this.emit();
  };

  private emit() {
    for (const l of this.listeners) l();
  }

  getAction = (actionId: string) => this.registry.get(actionId);

  dispatch = async (
    rawActionId: string,
    payload: Record<string, any> = {},
    source?: { event: string; originId?: string; auto?: boolean },
  ) => {
    const actionId = normalizeActionId(rawActionId);
    const action = this.registry.get(actionId);
    if (!action) {
        // STRICT MODE: Runtime must only execute actions from the registry.
        const msg = `[MiniAppRuntime] dispatch: Action not found: ${rawActionId} (normalized: ${actionId}). Execution blocked.`;
        console.error(msg);
        this.setError(msg);
        throw new Error(msg);
    }

    // Fix 7: Action Graph Ordering (Conditionals)
    if (action.runIf) {
        const ctx = { state: this.snapshot.state, payload: payload ?? {}, results: this.resultsByActionId };
        const shouldRun = evaluateExpression(action.runIf, ctx);
        // Strict check: false, "false", null, undefined -> skip.
        // 0 or "" might be valid inputs, but usually "runIf" implies boolean.
        if (shouldRun === false || shouldRun === "false" || shouldRun === null || shouldRun === undefined) {
             console.log(`[MiniAppRuntime] Skipping action ${actionId} because runIf evaluated to ${shouldRun}`);
             return;
        }
    }

    const startedAt = Date.now();
    this.snapshot = { ...this.snapshot, runningActions: [...this.snapshot.runningActions, { actionId, startedAt }] };
    this.addTrace({
      actionId,
      type: "action",
      status: "started",
      message: `Action ${actionId} started via ${source?.event ?? "unknown"}` + (source?.auto ? " (auto)" : ""),
      data: source ? { originId: source.originId, event: source.event, auto: !!source.auto } : undefined,
    });
    this.emit();

    try {
      const steps = Array.isArray(action.steps) && action.steps.length ? action.steps : [{ type: action.type, config: action.config ?? {} }];
      for (const step of steps) {
        await this.runStep(actionId, step.type, step.config ?? {}, payload);
      }
      this.addTrace({
        actionId,
        type: "action",
        status: "completed",
        message: `Action ${actionId} completed`,
        data: source ? { originId: source.originId, event: source.event, auto: !!source.auto } : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.setError(msg);
      this.addTrace({
        actionId,
        type: "action",
        status: "error",
        message: msg,
        data: source ? { originId: source.originId, event: source.event, auto: !!source.auto } : undefined,
      });
    } finally {
      this.snapshot = { ...this.snapshot, runningActions: this.snapshot.runningActions.filter((a) => a.actionId !== actionId || a.startedAt !== startedAt) };
      this.emit();
    }
  };

  private async runStep(actionId: string, type: string, config: Record<string, any>, payload: Record<string, any>) {
    const ctx = { state: this.snapshot.state, payload, results: this.resultsByActionId };
    if (type === "state_mutation") {
      const updates = (config.updates ?? config.set ?? {}) as Record<string, any>;
      const resolved = evaluateArgs(updates, ctx);
      this.setState({ ...resolved });
      return;
    }

    if (type === "navigation") {
      const pageId = config.pageId;
      if (typeof pageId === "string" && pageId.length) this.setActivePageId(pageId);
      return;
    }

    if (type === "derive_state") {
      const tmp = { ...this.snapshot.state, __derivations: [config] };
      const patch = this.computeDerivedPatch(tmp);
      this.setState(patch);
      return;
    }

    if (type === "integration_call") {
      const argsRaw: Record<string, any> =
        (config.args ?? config.params ?? config.payload ?? {}) as Record<string, any>;
      const args = evaluateArgs(argsRaw, ctx);
      const assignKey = typeof config.assign === "string" ? config.assign : undefined;

      // Set loading state
      const loadingPatch: Record<string, any> = {
        [`${actionId}.status`]: "loading",
        [`${actionId}.error`]: null,
      };
      if (assignKey) {
        loadingPatch[`${assignKey}Status`] = "loading";
        loadingPatch[`${assignKey}Error`] = null;
      }
      this.setState(loadingPatch);

      const call = { actionId, startedAt: Date.now(), args: { ...args } };
      this.snapshot = { ...this.snapshot, integrationCalls: [...this.snapshot.integrationCalls, call] };
      this.addTrace({ actionId, type: "integration", status: "loading", message: `Calling integration...`, data: args });
      this.emit();

      const res = await this.integrations.call(actionId, args);
      this.resultsByActionId[actionId] = res;

      if (res.status === "success") {
        const patch: Record<string, any> = {
          [`${actionId}.data`]: res.rows,
          [`${actionId}.status`]: "success",
          [`${actionId}.error`]: null,
        };
        if (assignKey) {
          patch[assignKey] = res.rows;
          patch[`${assignKey}Status`] = "success";
          patch[`${assignKey}Error`] = null;
        }
        this.setState(patch);
        this.addTrace({ actionId, type: "integration", status: "success", message: `Integration success`, data: { rows: res.rows?.length } });
      } else {
        const patch: Record<string, any> = {
          [`${actionId}.status`]: "error",
          [`${actionId}.error`]: res.error,
        };
        if (assignKey) {
          patch[`${assignKey}Status`] = "error";
          patch[`${assignKey}Error`] = res.error;
        }
        this.setState(patch);
        this.addTrace({ actionId, type: "integration", status: "error", message: res.error });
        throw new Error(res.error);
      }

      this.snapshot = {
        ...this.snapshot,
        integrationCalls: this.snapshot.integrationCalls.map((c) =>
          c === call ? { ...c, status: res.status } : c,
        ),
      };
      this.emit();

      return;
    }
  }
}

export function validateRegisteredComponents(spec: MiniAppSpec) {
  // Enforce component canonicalization (lowercase types)
  for (const page of spec.pages ?? []) {
    walkComponents((page.components ?? []) as any, (c) => {
      if (c.type && typeof c.type === "string") {
        c.type = c.type.toLowerCase();
      }
    });
  }

  const missing: Array<{ id: string; type: string }> = [];
  for (const page of spec.pages ?? []) {
    walkComponents((page.components ?? []) as any, (c) => {
      try {
        getMiniAppComponent(String(c.type));
      } catch {
        missing.push({ id: String(c.id), type: String(c.type) });
      }
    });
  }
  if (missing.length) {
    const msg = JSON.stringify({
      error: "unsupported_component",
      missing,
      allowedTypes: Object.keys(MINI_APP_COMPONENTS),
    });
    throw new Error(msg);
  }
}

function MiniAppHealthPanel({ snapshot }: { snapshot: RuntimeSnapshot }) {
  const trace = snapshot.state._trace || [];
  return (
    <div className="border-t p-4 text-xs font-mono bg-muted text-muted-foreground max-h-[400px] overflow-auto">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="font-semibold mb-2 sticky top-0 bg-muted py-1 border-b">Action Trace</div>
          <div className="space-y-2">
            {trace.length === 0 ? <div className="italic">No events yet</div> : null}
            {trace.map((t: any) => (
               <div key={t.id} className="border-l-2 pl-2 border-muted-foreground/20">
                 <div className="flex gap-2">
                   <span className="opacity-50">[{new Date(t.timestamp).toLocaleTimeString()}]</span>
                   <span className={t.status === 'error' ? 'text-red-600 font-bold' : t.status === 'success' ? 'text-green-600 font-bold' : ''}>
                     {t.type === 'action' ? '⚡' : '🔄'} {t.actionId}
                   </span>
                   <span className="uppercase text-[10px] border px-1 rounded">{t.status}</span>
                 </div>
                 {t.message ? <div className="mt-1 opacity-75 whitespace-pre-wrap">{t.message}</div> : null}
                 {t.data ? <pre className="mt-1 opacity-50 text-[10px]">{JSON.stringify(t.data)}</pre> : null}
               </div>
            ))}
          </div>
        </div>
        <div>
           <div className="font-semibold mb-2 sticky top-0 bg-muted py-1 border-b">State Snapshot</div>
           <pre className="whitespace-pre-wrap break-words">{JSON.stringify(snapshot.state, (k, v) => (k === "_trace" || k === "__derivations") ? undefined : v, 2)}</pre>
        </div>
      </div>
    </div>
  );
}

function MiniAppRoot({
  spec,
  integrations,
  initialState,
}: {
  spec: MiniAppSpec;
  integrations: MiniAppIntegrations;
  initialState?: Record<string, any>;
}) {
  const store = React.useMemo(() => {
    validateRegisteredComponents(spec);
    return new MiniAppStore(spec, integrations, initialState ?? {});
  }, [spec, integrations, initialState]);

  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [showHealth, setShowHealth] = React.useState(false);

  const activePage = React.useMemo(
    () => (spec.pages ?? []).find((p) => p.id === snapshot.activePageId) ?? null,
    [spec.pages, snapshot.activePageId],
  );

  // Global Lifecycle: onLoad & onUnload
  const lifecycleFired = React.useRef(false);
  React.useEffect(() => {
    if (lifecycleFired.current) return;
    lifecycleFired.current = true;

    // onLoad
    const onLoad = spec.lifecycle?.onLoad ?? [];
    for (const h of onLoad) store.dispatch(h.actionId, h.args ?? {}, { event: "onLoad" });

    return () => {
      // onUnload
      const onUnload = spec.lifecycle?.onUnload ?? [];
      for (const h of onUnload) store.dispatch(h.actionId, h.args ?? {}, { event: "onUnload" });
    };
  }, [spec.lifecycle, store]);

  // Global Lifecycle: onInterval
  React.useEffect(() => {
    const intervals: NodeJS.Timeout[] = [];
    const onInterval = spec.lifecycle?.onInterval ?? [];
    
    for (const h of onInterval) {
      if (h.intervalMs && h.intervalMs > 0) {
        const id = setInterval(() => {
          store.dispatch(h.actionId, h.args ?? {}, { event: "onInterval" });
        }, h.intervalMs);
        intervals.push(id);
      }
    }

    return () => {
      intervals.forEach(clearInterval);
    };
  }, [spec.lifecycle, store]);

  const pageLoadFired = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    if (!activePage?.id) return;
    if (pageLoadFired.current.has(activePage.id)) return;
    pageLoadFired.current.add(activePage.id);

    const handlers = (activePage.events ?? []).filter((e) => e.type === "onLoad" || e.type === "onPageLoad");
    for (const h of handlers) store.dispatch(h.actionId, h.args ?? {}, { event: h.type, originId: activePage.id, auto: !!h.args?.autoAttached });
  }, [activePage, store]);

  const componentLoadFired = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    if (!activePage) return;
    walkComponents(activePage.components as any, (c) => {
      if (!c?.id) return;
      if (componentLoadFired.current.has(String(c.id))) return;
      componentLoadFired.current.add(String(c.id));
      const handlers = (c.events ?? []).filter((e: any) => e.type === "onComponentLoad" || e.type === "onLoad");
      for (const h of handlers) store.dispatch(h.actionId, h.args ?? {}, { event: h.type, originId: String(c.id), auto: !!h.args?.autoAttached });
    });
  }, [activePage, store]);

  const emitFromComponent = React.useCallback(
    (componentId: string, eventName: string, payload?: any) => {
      if (!activePage) return;

      let found: MiniAppComponentSpec | null = null;
      walkComponents(activePage.components as any, (c) => {
        if (found) return;
        if (String(c.id) === componentId) found = c;
      });
      if (!found) return;

      const comp = found as MiniAppComponentSpec;
      const handlers = (comp.events ?? []).filter((e) => e.type === eventName);
      for (const h of handlers) store.dispatch(h.actionId, { ...(h.args ?? {}), ...(payload ?? {}) }, { event: eventName, originId: componentId });
    },
    [activePage, store],
  );

  const renderComponent: (component: MiniAppComponentSpec) => React.ReactNode = React.useCallback(function renderComponent(
    component: MiniAppComponentSpec,
  ): React.ReactNode {
      const def = getMiniAppComponent(component.type);
      const actions = { dispatch: (actionId: string, payload?: Record<string, any>) => void store.dispatch(actionId, payload ?? {}) };
      return def.render({
        state: snapshot.state,
        actions,
        setState: store.setState,
        emit: (eventName, payload) => emitFromComponent(component.id, eventName, payload),
        component,
        renderChildren: (children) => <>{children.map((c) => <React.Fragment key={c.id}>{renderComponent(c)}</React.Fragment>)}</>,
      });
    }, [emitFromComponent, snapshot.state, store]);

  if (!activePage) {
    return <div className="p-8 text-center text-muted-foreground">No pages defined.</div>;
  }

  const layoutClass =
    activePage.layoutMode === "stack"
      ? "flex flex-col gap-4 max-w-6xl mx-auto"
      : "grid gap-4 md:grid-cols-2 lg:grid-cols-4 max-w-6xl mx-auto";

  return (
    <div className="h-full flex flex-col bg-background">
      {snapshot.lastError ? (
        <div className="bg-destructive/10 text-destructive px-4 py-2 text-sm flex justify-between items-center">
          <span>Error: {snapshot.lastError}</span>
          <button onClick={() => store.setError(null)} className="hover:underline">
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="border-b px-6 py-4 flex items-center justify-between bg-card">
        <div>
          <h1 className="text-xl font-semibold">{spec.title}</h1>
          {spec.description ? <p className="text-sm text-muted-foreground">{spec.description}</p> : null}
        </div>

        <div className="flex items-center gap-4">
          {spec.pages?.length > 1 ? (
            <div className="flex gap-2">
              {spec.pages.map((p) => (
                <button
                  key={p.id}
                  onClick={() => store.setActivePageId(p.id)}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    snapshot.activePageId === p.id ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted text-muted-foreground"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          ) : null}
          <button
            onClick={() => setShowHealth((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            {showHealth ? "Hide health" : "Show health"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 bg-muted/5">
        <div className={layoutClass}>
          {(activePage.components ?? []).map((c) => (
            <div key={c.id} className={c.layout?.w ? `col-span-${Math.min(c.layout.w, 4)}` : "col-span-1"}>
              {renderComponent(c as any)}
            </div>
          ))}
        </div>
      </div>

      {showHealth ? <MiniAppHealthPanel snapshot={snapshot} /> : null}
    </div>
  );
}

export const MiniAppRuntime = {
  run({
    spec,
    integrations,
    initialState,
  }: {
    spec: MiniAppSpec;
    integrations: MiniAppIntegrations;
    initialState?: Record<string, any>;
  }) {
    return <MiniAppRoot spec={spec} integrations={integrations} initialState={initialState} />;
  },
};
