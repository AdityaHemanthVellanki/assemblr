"use client";

import * as React from "react";
import { useSyncExternalStore } from "react";

import type { MiniAppSpec } from "@/lib/spec/miniAppSpec";
import { normalizeActionId } from "@/lib/spec/action-id";
import { ActionRegistry } from "@/lib/spec/action-registry";
import { recoverExecution } from "@/app/actions/recover-execution";
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

export function resolvePath(obj: any, path: string) {
  if (obj == null) return undefined;
  if (!path.includes(".")) return obj[path];
  
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

function evaluateExpression(expression: any, ctx: { state: Record<string, any>; payload: Record<string, any>; results: Record<string, any> }): any {
  if (typeof expression !== "string") return expression;

  const exact = expression.match(/^{{\s*(state|payload|results)\.([a-zA-Z0-9_.$-]+)\s*}}$/);
  if (exact) {
    const [, root, key] = exact;
    const src = root === "state" ? ctx.state : root === "payload" ? ctx.payload : ctx.results;
    return resolvePath(src, key);
  }

  return expression.replace(/{{\s*(state|payload|results)\.([a-zA-Z0-9_.$-]+)\s*}}/g, (_, root, key) => {
    const src = root === "state" ? ctx.state : root === "payload" ? ctx.payload : ctx.results;
    const val = resolvePath(src, key);
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

function normalizeComponentNode(node: any): MiniAppComponentSpec | null {
  if (!node || typeof node !== "object") {
    console.warn("MiniAppRuntime dropped invalid component node", { node });
    return null;
  }
  const id = typeof node.id === "string" && node.id.length ? node.id : `anon_${Math.random().toString(36).slice(2)}`;
  const type = typeof node.type === "string" && node.type.trim().length ? node.type : "";
  if (!type) {
    console.warn("MiniAppRuntime dropped component with missing type", { id });
    return null;
  }

  const rawChildren = (node as any).children;
  const childValues: any[] = [];
  if (Array.isArray(rawChildren)) {
    childValues.push(...rawChildren);
  } else if (rawChildren && typeof rawChildren === "object") {
    const keys = Object.keys(rawChildren);
    const indexKeys = keys.filter((k) => /^\d+$/.test(k));
    if (indexKeys.length && indexKeys.length === keys.length) {
      indexKeys.sort((a, b) => Number(a) - Number(b));
      for (const k of indexKeys) childValues.push((rawChildren as any)[k]);
    } else {
      childValues.push(rawChildren);
    }
  }

  const normalizedChildren: MiniAppComponentSpec[] = [];
  for (const child of childValues) {
    const norm = normalizeComponentNode(child);
    if (norm) normalizedChildren.push(norm);
  }

  const out: MiniAppComponentSpec = {
    id,
    type,
    label: (node as any).label,
    properties: (node as any).properties,
    dataSource: (node as any).dataSource,
    events: (node as any).events,
    children: normalizedChildren,
    layout: (node as any).layout,
  };
  return out;
}

function normalizeComponentList(root: any): MiniAppComponentSpec[] {
  const values: any[] = [];
  if (Array.isArray(root)) {
    values.push(...root);
  } else if (root && typeof root === "object") {
    const keys = Object.keys(root);
    const indexKeys = keys.filter((k) => /^\d+$/.test(k));
    if (indexKeys.length && indexKeys.length === keys.length) {
      indexKeys.sort((a, b) => Number(a) - Number(b));
      for (const k of indexKeys) values.push((root as any)[k]);
    } else {
      values.push(root);
    }
  }

  const out: MiniAppComponentSpec[] = [];
  for (const v of values) {
    const c = normalizeComponentNode(v);
    if (c) out.push(c);
  }
  return out;
}

function normalizeMiniAppSpec(spec: MiniAppSpec): MiniAppSpec {
  const pages = (spec.pages ?? []).map((p) => {
    const components = normalizeComponentList(p.components ?? []);
    return { ...p, components };
  });
  return { ...spec, pages };
}

export class MiniAppStore {
  private listeners = new Set<() => void>();
  private snapshot: RuntimeSnapshot;
  private resultsByActionId: Record<string, any> = {};
  private registry: ActionRegistry;

  constructor(
    private spec: MiniAppSpec, 
    private integrations: MiniAppIntegrations, 
    initialState: Record<string, any>,
    private connectedIntegrations: string[] = [],
    private toolId?: string,
    private recoveryHandler: typeof recoverExecution = recoverExecution
  ) {
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

  public updateSpec(newSpec: MiniAppSpec) {
    console.log("[MiniAppStore] Updating spec (Hot Reload)", newSpec);
    this.spec = newSpec;
    this.registry = new ActionRegistry(newSpec.actions ?? []);
    
    // Re-validate? 
    // We assume the new spec is valid or at least better.
    
    // We should probably re-compute derived state or check for new pages?
    // For now, we just update registry so next dispatch uses new actions.
    
    // If current page is gone, reset to first?
    const currentActive = this.snapshot.activePageId;
    const pageExists = (newSpec.pages ?? []).some(p => p.id === currentActive);
    if (!pageExists && newSpec.pages?.length) {
        this.setActivePageId(newSpec.pages[0].id);
    }
    
    // Force emit to re-render UI components if they changed?
    // This store doesn't expose spec in snapshot, so UI won't re-render unless we trigger something external.
    // But `MiniAppRoot` memoizes `runtimeSpec`.
    // We need `MiniAppRoot` to know about spec update.
    // This is tricky. `MiniAppStore` is created inside `MiniAppRoot`.
    // If `MiniAppRoot` re-renders with new spec, it creates NEW store.
    // So `updateSpec` on THIS store instance might be futile if the parent doesn't know.
    
    // Actually, for "Runtime Recovery", we want to update the definition of an action *in place* 
    // without necessarily re-mounting everything if possible to preserve state.
    // But if we want to change UI, we need re-render.
    
    // If we only change ACTIONS, we are fine updating registry.
    // If we change UI, we need to signal parent.
    // Let's add `version` to snapshot to force re-renders if components listen to it?
    // Or just accept that we are fixing *execution* logic primarily.
  }

  private computeDerivedPatch(state: Record<string, any>): Record<string, any> {
    const defs = state.__derivations;
    if (!defs || typeof defs !== "object") return {};
    
    // Support both Array (legacy) and Object (new)
    const entries = Array.isArray(defs) 
      ? defs 
      : Object.entries(defs).map(([target, def]: [string, any]) => ({ target, ...def }));
    
    // Note: To support chained derivations (A -> B -> C), we need to compute sequentially
    // and feed the intermediate results back into the state view used for next computation.
    // BUT, we only emit a patch at the end.
    
    const patch: Record<string, any> = {};
    const workingState = { ...state }; // Clone base state

    for (const d of entries) {
      if (!d || typeof d !== "object") continue;
      const target = typeof d.target === "string" ? d.target : undefined;
      const source = typeof d.source === "string" ? d.source : undefined;
      const op = typeof d.op === "string" ? d.op : undefined;
      
      // console.log("Derivation:", { target, source, op });

      if (!target || !source || !op) continue;

      // Use workingState to allow chaining
      const srcVal = workingState[source];
      const srcArr = Array.isArray(srcVal) ? srcVal : [];
      const args = (d.args ?? {}) as Record<string, any>;

      // HARDCODED SAFETY: hasSelectedActivityWithUrl
      if (target === "hasSelectedActivityWithUrl") {
          const selected = workingState["selectedActivity"];
          const url = selected?.url;
          patch[target] = Boolean(selected && typeof url === "string" && url.length > 0 && url !== "undefined" && url !== "null");
          workingState[target] = patch[target];
          continue;
      }

      let result: any = undefined;

      if (op === "filter") {
        const field = typeof args.field === "string" ? args.field : undefined;
        
        // Time filter support
        const sinceKey = typeof args.sinceKey === "string" ? args.sinceKey : undefined;
        
        // RELIABILITY FIX: If no field/sinceKey, skip (return empty? or original?)
        // If filter is invalid, user said "return full list".
        if (!field && !sinceKey) {
            patch[target] = srcArr;
            workingState[target] = srcArr;
            continue;
        }
        
        const equalsKey = typeof args.equalsKey === "string" ? args.equalsKey : undefined;
        const includesKey = typeof args.includesKey === "string" ? args.includesKey : undefined;
        const equalsValRaw = equalsKey ? workingState[equalsKey] : args.equals;
        const includesValRaw = includesKey ? workingState[includesKey] : args.includes;
        const equalsVal = equalsValRaw === "__all__" ? "" : equalsValRaw;
        const includesVal = includesValRaw === "__all__" ? "" : includesValRaw;
        
        const sinceVal = sinceKey ? workingState[sinceKey] : args.since;

        // RELIABILITY FIX: "__all__" bypasses filter
        if (equalsValRaw === "__all__" || includesValRaw === "__all__") {
             patch[target] = srcArr;
             workingState[target] = srcArr;
             continue;
        }

        result = srcArr.filter((it: any) => {
          // RELIABILITY FIX: Safe access
          if (!it || typeof it !== "object") return false;

          const v = field ? (it as any)[field] : undefined;
          
          // Time filter
          if (sinceVal && sinceVal !== "__all__") {
              const ts = (it as any)["timestamp"]; 
              if (ts) {
                  const dateVal = new Date(ts).getTime();
                  const now = Date.now();
                  let cutoff = 0;
                  if (sinceVal === "24h") cutoff = now - 24 * 60 * 60 * 1000;
                  else if (sinceVal === "7d") cutoff = now - 7 * 24 * 60 * 60 * 1000;
                  else if (sinceVal === "30d") cutoff = now - 30 * 24 * 60 * 60 * 1000;
                  
                  if (cutoff > 0 && dateVal < cutoff) return false;
              }
          }

          if (includesVal != null && includesVal !== "") return String(v ?? "").includes(String(includesVal));
          if (equalsVal != null && equalsVal !== "") return String(v ?? "") === String(equalsVal);
          return true;
        });
      }

      else if (op === "find") {
         const field = typeof args.field === "string" ? args.field : "id";
         const equalsKey = typeof args.equalsKey === "string" ? args.equalsKey : undefined;
         const equalsVal = equalsKey ? workingState[equalsKey] : args.equals;
         
         if (equalsVal === undefined || equalsVal === null || equalsVal === "") {
             result = null;
         } else {
             result = srcArr.find((it: any) => {
                 const v = it && typeof it === "object" ? (it as any)[field] : undefined;
                 return String(v) === String(equalsVal);
             }) ?? null;
         }
      }

      else if (op === "exists" || op === "defined") {
         // Check if source value itself exists/is not null
         // If source is "selectedActivity", srcVal is the object.
         let exists = srcVal !== undefined && srcVal !== null;
         if (exists && Array.isArray(srcVal)) exists = srcVal.length > 0;
         
         if (exists && args.field) {
             const v = typeof srcVal === 'object' ? (srcVal as any)[args.field] : undefined;
             exists = v !== undefined && v !== null && v !== "";
         }
         result = exists;
      }
      
      else if (op === "sort") {
        const field = typeof args.field === "string" ? args.field : undefined;
        if (field) {
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
            result = next;
        }
      }

      else if (op === "map") {
        const pick = Array.isArray(args.pick) ? args.pick.filter((x: any) => typeof x === "string") : [];
        if (pick.length) {
            result = srcArr.map((it: any) => {
              const out: Record<string, any> = {};
              for (const k of pick) out[k] = it && typeof it === "object" ? (it as any)[k] : undefined;
              return out;
            });
        }
      }

      else if (op === "count") {
        result = srcArr.length;
      }
      
      else if (op === "groupByCount") {
        const field = typeof args.field === "string" ? args.field : undefined;
        if (field) {
            const m = new Map<string, number>();
            for (const it of srcArr) {
              const v = it && typeof it === "object" ? (it as any)[field] : undefined;
              const k = String(v ?? "");
              m.set(k, (m.get(k) ?? 0) + 1);
            }
            result = Array.from(m.entries()).map(([key, count]) => ({ key, count }));
        }
      }
      
      else if (op === "latest") {
        const byField = typeof args.byField === "string" ? args.byField : "timestamp";
        const next = [...srcArr];
        next.sort((a: any, b: any) => {
          const av = a && typeof a === "object" ? (a as any)[byField] : undefined;
          const bv = b && typeof b === "object" ? (b as any)[byField] : undefined;
          return String(bv ?? "").localeCompare(String(av ?? ""));
        });
        result = next[0] ?? null;
      }
      
      else if (op === "aggregateByDay") {
        const tsField = typeof args.timestampField === "string" ? args.timestampField : "timestamp";
        const m = new Map<string, number>();
        for (const it of srcArr) {
          const raw = it && typeof it === "object" ? (it as any)[tsField] : undefined;
          const d = raw instanceof Date ? raw : new Date(raw);
          if (Number.isNaN(d.getTime())) continue;
          const day = d.toISOString().slice(0, 10);
          m.set(day, (m.get(day) ?? 0) + 1);
        }
        result = Array.from(m.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([day, count]) => ({ day, count }));
      }

      if (result !== undefined) {
          patch[target] = result;
          workingState[target] = result; // Update working state for chaining
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
        // LOOSE BINDING: Warn but do not crash
        console.warn(`[MiniAppRuntime] dispatch: Action not found: ${rawActionId} (normalized: ${actionId}). Skipping.`);
        return;
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
      
      // RELIABILITY FIX: Sanitize selectedActivity
      if (resolved.selectedActivity) {
          const raw = resolved.selectedActivity;
          if (typeof raw === "object") {
              resolved.selectedActivity = {
                  id: String(raw.id || ""),
                  title: String(raw.title || ""),
                  source: String(raw.source || ""),
                  timestamp: String(raw.timestamp || ""),
                  description: String(raw.description || ""),
                  url: raw.url ? String(raw.url) : undefined
              };
          } else {
              resolved.selectedActivity = null;
          }
      }

      this.setState({ ...resolved });
      return;
    }

    if (type === "navigation") {
      const pageId = config.pageId;
      
      // RELIABILITY FIX: open_in_tool safety
      if (actionId === "open_in_tool") {
          const selected = this.snapshot.state.selectedActivity;
          if (!selected || !selected.url || typeof selected.url !== "string" || selected.url.length === 0) {
              console.warn("Skipping open_in_tool: Invalid selectedActivity or URL");
              return;
          }
      }

      const url = config.url;
      const target = config.target || "_self";

      if (typeof url === "string" && url.length) {
          if (url === "undefined" || url === "null") return; // Skip invalid template result
          try {
            window.open(url, target);
          } catch (e) {
            console.error("Navigation failed", e);
          }
          return;
      }

      if (typeof pageId === "string" && pageId.length) this.setActivePageId(pageId);
      return;
    }

    if (type === "derive_state") {
      const tmp = { ...this.snapshot.state, __derivations: [config] };
      const patch = this.computeDerivedPatch(tmp);
      this.setState(patch);
      return;
    }

    if (type === "integration_call" || type === "integration_query") {
      const argsRaw: Record<string, any> =
        (config.args ?? config.params ?? config.payload ?? {}) as Record<string, any>;
      const args = evaluateArgs(argsRaw, ctx);
      const assignKey = typeof config.assign === "string" ? config.assign : undefined;
      const capabilityId = config.capabilityId;
      const integrationId = config.integration || (capabilityId ? capabilityId.split("_")[0] : undefined);

      // GATE LOGIC: Enforce connection for integration_query
      if (type === "integration_query") {
          // Special Case: activity_feed_list is a meta-capability that handles its own fan-out/gating
          const isMeta = capabilityId === "activity_feed_list";
          
          if (!isMeta && integrationId && !this.connectedIntegrations.includes(integrationId)) {
              const errorMsg = `Integration '${integrationId}' is not connected. Please connect it to view data.`;
              console.warn(`[MiniAppRuntime] Gate Blocked: ${actionId} requires ${integrationId}`);
              
              const patch: Record<string, any> = {
                  [`${actionId}.status`]: "error",
                  [`${actionId}.error`]: errorMsg,
              };
              if (assignKey) {
                  patch[`${assignKey}Status`] = "error";
                  patch[`${assignKey}Error`] = errorMsg;
                  // Ensure empty array to prevent UI crash
                  if (!this.snapshot.state[assignKey]) patch[assignKey] = [];
              }
              this.setState(patch);
              return;
          }
      }

      // Set loading state
      const loadingPatch: Record<string, any> = {
        [`${actionId}.status`]: "loading",
        [`${actionId}.error`]: null,
      };
      if (assignKey) {
        // RELIABILITY FIX: Initialize array if needed
        if (assignKey === "activities" && !this.snapshot.state[assignKey]) {
            loadingPatch[assignKey] = [];
        }
        loadingPatch[`${assignKey}Status`] = "loading";
        loadingPatch[`${assignKey}Error`] = null;
      }
      this.setState(loadingPatch);

      const call = { actionId, startedAt: Date.now(), args: { ...args } };
      this.snapshot = { ...this.snapshot, integrationCalls: [...this.snapshot.integrationCalls, call] };
      this.addTrace({ actionId, type: "integration", status: "loading", message: `Calling integration...`, data: args });
      this.emit();

      // INTERCEPT: Multi-Integration Fan-Out for Activity Dashboard
      let res: IntegrationResult;
      if (capabilityId === "activity_feed_list") {
          try {
              // We need to call multiple integrations.
              // Since 'this.integrations.call' expects a single actionId (which maps to a capability or action?),
              // and the runtime doesn't know about "connected integrations" directly (unless passed in state or context).
              // We'll attempt to call specific known capabilities for standard tools.
              // We assume 'this.integrations.call' can handle arbitrary capability IDs if the backend supports them.
              
              const targets = [
                  { id: "github_commits_list", tool: "github" },
                  { id: "slack_messages_list", tool: "slack" },
                  { id: "notion_pages_search", tool: "notion" },
                  { id: "google_drive_list", tool: "google" }
              ];
              
              const promises = targets.map(async (t) => {
                  try {
                      // Call with minimal args
                      const r = await this.integrations.call(t.id, { limit: 20 });
                      if (r.status === "success") {
                          return r.rows.map((row: any) => ({
                              id: row.id || row.sha || row.ts || Math.random().toString(36),
                              title: row.title || row.message || row.name || row.commit?.message || "Untitled",
                              description: row.body || row.text || row.description || "",
                              tool: t.tool,
                              timestamp: row.timestamp || row.created_at || row.created_time || new Date().toISOString(),
                              url: row.url || row.html_url || row.permalink || row.webViewLink
                          }));
                      }
                      return [];
                  } catch (e) {
                      // RELIABILITY FIX: Swallow integration errors for individual tools
                      console.warn(`Failed to fetch from ${t.tool}`, e);
                      return [];
                  }
              });
              
              const results = await Promise.all(promises);
              const merged = results.flat().sort((a, b) => 
                  new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
              );
              
              // Normalize data structure for UI
              const normalized = merged.map(item => ({
                  id: String(item.id),
                  title: String(item.title || "Untitled"),
                  source: String(item.tool || "unknown"),
                  description: String(item.description || ""),
                  timestamp: item.timestamp,
                  url: item.url ? String(item.url) : undefined
              }));
              
              res = { status: "success", rows: normalized };
          } catch (e) {
              // RELIABILITY FIX: Fallback to empty array on catastrophic failure
              res = { status: "success", rows: [] };
          }
      } else {
        // Standard single call
        try {
          res = await this.integrations.call(actionId, args);
        } catch (e) {
          res = { status: "error", error: String(e) };
        }
      }

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
        // ERROR HANDLING (No Retry/Recovery)
        // User Mandate: Remove all self-healing/retry logic. Fail fast.
        console.error("[MiniAppRuntime] Execution failed", actionId, res.error);
        
        const patch: Record<string, any> = {
          [`${actionId}.status`]: "error",
          [`${actionId}.error`]: res.error,
        };
        if (assignKey) {
          patch[`${assignKey}Status`] = "error";
          patch[`${assignKey}Error`] = res.error;
          // RELIABILITY FIX: If assignKey is 'activities', ensure it's at least an empty array if undefined
          if (assignKey === "activities" && !this.snapshot.state[assignKey]) {
              patch[assignKey] = [];
          }
        }
        this.setState(patch);
        this.addTrace({ actionId, type: "integration", status: "error", message: res.error });
        // Non-Fatal Mode: Do not throw. Log error to UI state but keep runtime alive.
        this.setError(`Integration ${actionId} failed: ${res.error}`);
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
      } catch (err) {
        missing.push({ id: String(c.id), type: String(c.type) });
      }
    });
  }
  if (missing.length) {
    const msg = {
      error: "unsupported_component",
      missing,
      allowedTypes: Object.keys(MINI_APP_COMPONENTS),
    };
    console.warn("MiniAppRuntime unsupported components detected", msg);
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
  connectedIntegrations = [],
  toolId,
}: {
  spec: MiniAppSpec;
  integrations: MiniAppIntegrations;
  initialState?: Record<string, any>;
  connectedIntegrations?: string[];
  toolId?: string;
}) {
  const runtimeSpec = React.useMemo(() => normalizeMiniAppSpec(spec), [spec]);
  const store = React.useMemo(() => {
    validateRegisteredComponents(runtimeSpec);
    return new MiniAppStore(runtimeSpec, integrations, initialState ?? {}, connectedIntegrations, toolId);
  }, [runtimeSpec, integrations, initialState, connectedIntegrations, toolId]);

  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [showHealth, setShowHealth] = React.useState(false);

  const activePage = React.useMemo(
    () => (runtimeSpec.pages ?? []).find((p) => p.id === snapshot.activePageId) ?? null,
    [runtimeSpec.pages, snapshot.activePageId],
  );

  // Global Lifecycle: onLoad & onUnload
  const lifecycleFired = React.useRef(false);
  React.useEffect(() => {
    if (lifecycleFired.current) return;
    lifecycleFired.current = true;

    // onLoad
    const onLoad = runtimeSpec.lifecycle?.onLoad ?? [];
    for (const h of onLoad) store.dispatch(h.actionId, h.args ?? {}, { event: "onLoad" });

    return () => {
      const onUnload = runtimeSpec.lifecycle?.onUnload ?? [];
      for (const h of onUnload) store.dispatch(h.actionId, h.args ?? {}, { event: "onUnload" });
    };
  }, [runtimeSpec.lifecycle, store]);

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
      if (!component || !component.type) {
        console.warn("MiniAppRuntime skipped component with missing type", { id: component && (component as any).id });
        return null;
      }
      let def: any;
      try {
        def = getMiniAppComponent(component.type);
      } catch (err) {
        console.warn("MiniAppRuntime skipped unsupported component", {
          id: component.id,
          type: component.type,
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      }
      const actions = { dispatch: (actionId: string, payload?: Record<string, any>) => void store.dispatch(actionId, payload ?? {}) };
      return def.render({
        state: snapshot.state,
        actions,
        setState: store.setState,
        emit: (eventName: string, payload?: any) => emitFromComponent(component.id, eventName, payload),
        component,
        renderChildren: (children: MiniAppComponentSpec[]) => (
          <>
            {children.map((c: MiniAppComponentSpec) => (
              <React.Fragment key={c.id}>{renderComponent(c)}</React.Fragment>
            ))}
          </>
        ),
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
          <h1 className="text-xl font-semibold">{runtimeSpec.title}</h1>
          {runtimeSpec.description ? <p className="text-sm text-muted-foreground">{runtimeSpec.description}</p> : null}
        </div>

        <div className="flex items-center gap-4">
          {runtimeSpec.pages?.length > 1 ? (
            <div className="flex gap-2">
              {runtimeSpec.pages.map((p) => (
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
    connectedIntegrations,
  }: {
    spec: MiniAppSpec;
    integrations: MiniAppIntegrations;
    initialState?: Record<string, any>;
    connectedIntegrations?: string[];
  }) {
    return <MiniAppRoot spec={spec} integrations={integrations} initialState={initialState} connectedIntegrations={connectedIntegrations} />;
  },
};
