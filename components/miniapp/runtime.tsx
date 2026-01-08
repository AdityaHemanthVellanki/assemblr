"use client";

import * as React from "react";
import { useSyncExternalStore } from "react";

import type { MiniAppSpec } from "@/lib/spec/miniAppSpec";
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

class MiniAppStore {
  private listeners = new Set<() => void>();
  private snapshot: RuntimeSnapshot;
  private resultsByActionId: Record<string, any> = {};

  constructor(private spec: MiniAppSpec, private integrations: MiniAppIntegrations, initialState: Record<string, any>) {
    this.snapshot = {
      state: { ...(spec.state ?? {}), ...(initialState ?? {}) },
      activePageId: spec.pages?.[0]?.id ?? null,
      runningActions: [],
      integrationCalls: [],
      lastError: null,
    };
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  setState = (partial: Record<string, any>) => {
    if (!partial || typeof partial !== "object") return;
    this.snapshot = { ...this.snapshot, state: { ...this.snapshot.state, ...partial } };
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

  getAction = (actionId: string) => this.spec.actions?.find((a) => a.id === actionId);

  dispatch = async (actionId: string, payload: Record<string, any> = {}) => {
    const action = this.getAction(actionId);
    if (!action) return;

    const startedAt = Date.now();
    this.snapshot = { ...this.snapshot, runningActions: [...this.snapshot.runningActions, { actionId, startedAt }] };
    this.emit();

    try {
      const steps = Array.isArray(action.steps) && action.steps.length ? action.steps : [{ type: action.type, config: action.config ?? {} }];
      for (const step of steps) {
        await this.runStep(actionId, step.type, step.config ?? {}, payload);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.setError(msg);
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

    if (type === "integration_call") {
      const argsRaw: Record<string, any> =
        (config.args ?? config.params ?? config.payload ?? {}) as Record<string, any>;
      const args = evaluateArgs(argsRaw, ctx);

      const call = { actionId, startedAt: Date.now(), args: { ...args } };
      this.snapshot = { ...this.snapshot, integrationCalls: [...this.snapshot.integrationCalls, call] };
      this.emit();

      const res = await this.integrations.call(actionId, args);
      this.resultsByActionId[actionId] = res;

      const assignKey = typeof config.assign === "string" ? config.assign : undefined;
      if (res.status === "success") {
        const patch: Record<string, any> = {
          [`${actionId}.data`]: res.rows,
          [`${actionId}.status`]: "success",
          [`${actionId}.error`]: null,
        };
        if (assignKey) patch[assignKey] = res.rows;
        this.setState(patch);
      } else {
        this.setState({
          [`${actionId}.status`]: "error",
          [`${actionId}.error`]: res.error,
        });
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

function validateRegisteredComponents(spec: MiniAppSpec) {
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
  return (
    <div className="border-t p-4 text-xs font-mono bg-muted text-muted-foreground">
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <div className="font-semibold mb-1">Registered Components</div>
          <pre className="whitespace-pre-wrap break-words">{JSON.stringify(Object.keys(MINI_APP_COMPONENTS), null, 2)}</pre>
        </div>
        <div>
          <div className="font-semibold mb-1">Active State Keys</div>
          <pre className="whitespace-pre-wrap break-words">{JSON.stringify(Object.keys(snapshot.state ?? {}), null, 2)}</pre>
        </div>
        <div>
          <div className="font-semibold mb-1">Runtime</div>
          <pre className="whitespace-pre-wrap break-words">
            {JSON.stringify(
              {
                activePageId: snapshot.activePageId,
                runningActions: snapshot.runningActions,
                integrationCalls: snapshot.integrationCalls.slice(-10),
                lastError: snapshot.lastError,
              },
              null,
              2,
            )}
          </pre>
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
    for (const h of onLoad) store.dispatch(h.actionId, h.args ?? {});

    return () => {
      // onUnload
      const onUnload = spec.lifecycle?.onUnload ?? [];
      for (const h of onUnload) store.dispatch(h.actionId, h.args ?? {});
    };
  }, [spec.lifecycle, store]);

  // Global Lifecycle: onInterval
  React.useEffect(() => {
    const intervals: NodeJS.Timeout[] = [];
    const onInterval = spec.lifecycle?.onInterval ?? [];
    
    for (const h of onInterval) {
      if (h.intervalMs && h.intervalMs > 0) {
        const id = setInterval(() => {
          store.dispatch(h.actionId, h.args ?? {});
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
    for (const h of handlers) store.dispatch(h.actionId, h.args ?? {});
  }, [activePage, store]);

  const componentLoadFired = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    if (!activePage) return;
    walkComponents(activePage.components as any, (c) => {
      if (!c?.id) return;
      if (componentLoadFired.current.has(String(c.id))) return;
      componentLoadFired.current.add(String(c.id));
      const handlers = (c.events ?? []).filter((e: any) => e.type === "onComponentLoad" || e.type === "onLoad");
      for (const h of handlers) store.dispatch(h.actionId, h.args ?? {});
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
      for (const h of handlers) store.dispatch(h.actionId, { ...(h.args ?? {}), ...(payload ?? {}) });
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
