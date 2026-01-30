"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { safeFetch } from "@/lib/api/client";
import { startOAuthFlow } from "@/app/actions/oauth";

// --- Types mirroring backend types ---

type ConnectionMode = "zero_input" | "oauth" | "guided" | "advanced";

type FieldDef =
  | {
      kind: "string";
      id: string;
      label: string;
      placeholder?: string;
      required?: boolean;
      secret?: boolean;
    }
  | {
      kind: "number";
      id: string;
      label: string;
      placeholder?: string;
      required?: boolean;
    }
  | {
      kind: "boolean";
      id: string;
      label: string;
    };

type IntegrationAuthSchema =
  | { type: "api_key"; fields: FieldDef[]; advancedFields?: FieldDef[] }
  | { type: "database"; fields: FieldDef[]; advancedFields?: FieldDef[] }
  | { type: "oauth"; scopes: string[]; fields?: FieldDef[]; advancedFields?: FieldDef[] }
  | { type: "none" };

type IntegrationUiConfig = {
  id: string;
  name: string;
  category: string;
  logoUrl: string;
  description: string;
  connectionMode: ConnectionMode;
  auth: IntegrationAuthSchema;
};

type IntegrationListItem = IntegrationUiConfig & {
  connected: boolean;
  connectedAt: string | null;
  updatedAt: string | null;
  status: string;
};

type FilterMode = "all" | "connected" | "not_connected";

function statusDotClass(status: string) {
  if (status === "active") return "bg-emerald-500";
  if (status === "error") return "bg-red-500";
  return "bg-muted-foreground/50";
}

function statusLabel(status: string, connected: boolean) {
    if (!connected) return "Not connected";
    if (status === "active") return "Healthy";
    if (status === "error") return "Error";
    return "Connected";
}

function safeJsonMessage(err: unknown) {
  if (err && typeof err === "object" && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string") return msg;
  }
  return "Something went wrong";
}

function formatTimestamp(ts: string) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(d);
}

function FieldRenderer({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (val: unknown) => void;
}) {
  if (field.kind === "boolean") {
    const checked = Boolean(value);
    return (
      <label className="flex items-center justify-between gap-3 text-sm cursor-pointer hover:bg-muted/50 p-2 rounded-md -mx-2">
        <span>{field.label}</span>
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
      </label>
    );
  }

  const strValue =
    typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
  const inputType =
    field.kind === "number" ? "number" : field.secret ? "password" : "text";

  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">
        {field.label}
        {field.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <Input
        type={inputType}
        value={strValue}
        placeholder={field.placeholder}
        onChange={(e) =>
          onChange(field.kind === "number" ? Number(e.target.value) : e.target.value)
        }
      />
    </div>
  );
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = React.useState<IntegrationListItem[]>([]);
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<FilterMode>("all");
  const [loading, setLoading] = React.useState(true);
  const [pageError, setPageError] = React.useState<string | null>(null);

  const [active, setActive] = React.useState<IntegrationUiConfig | null>(null);
  const [formValues, setFormValues] = React.useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [disconnectMode, setDisconnectMode] = React.useState(false);
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [isConnecting, setIsConnecting] = React.useState(false);
  const [origin, setOrigin] = React.useState("");
  const router = useRouter();

  React.useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    setPageError(null);
    try {
      const payload = await safeFetch<{ integrations?: IntegrationListItem[] }>("/api/integrations");
      const list = payload.integrations;
      if (!Array.isArray(list)) throw new Error("Failed to load integrations");
      setIntegrations(list);
    } catch (err) {
      setPageError(err instanceof Error ? err.message : "Failed to load integrations");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const visible = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return integrations
      .filter((i) => {
        if (filter === "connected") return i.connected;
        if (filter === "not_connected") return !i.connected;
        return true;
      })
      .filter((i) => {
        if (!q) return true;
        return (
          i.name.toLowerCase().includes(q) ||
          i.category.toLowerCase().includes(q)
        );
      });
  }, [integrations, search, filter]);

  const activeStatus = React.useMemo(() => {
    if (!active) return null;
    return integrations.find((i) => i.id === active.id) ?? null;
  }, [active, integrations]);

  const openConnect = React.useCallback(async (integrationId: string) => {
    setFormError(null);
    setDisconnectMode(false);
    setSubmitting(false);
    setAdvancedOpen(false);

    const current = integrations.find((i) => i.id === integrationId);
    if (!current) return;

    // CRITICAL FIX: Direct OAuth Redirect
    // If it's an OAuth integration, skip the modal and redirect immediately.
    // The "connectionMode" logic might vary, but all 5 supported tools are "hosted_oauth".
    if (current.connectionMode === ("hosted_oauth" as any) || current.auth.type === "oauth") {
        try {
            // Set local loading state (optimistic)
            setIntegrations(prev => prev.map(p => p.id === integrationId ? { ...p, status: "connecting" } : p));
            setIsConnecting(true);
            
            const oauthUrl = await startOAuthFlow({
                providerId: integrationId,
                currentPath: window.location.pathname + window.location.search,
                integrationMode: "manual", // Default for global page
                // No chat/tool context
            });
            
            router.push(oauthUrl);
            return;
        } catch (e) {
            console.error("Connect failed", e);
            setPageError(e instanceof Error ? e.message : String(e));
            setIsConnecting(false);
            // Revert status
            await load(); // Refresh to get true status
            return;
        }
    }

    // Pre-fill defaults for other types (e.g. database/api_key)
    const initialValues: Record<string, unknown> = {};
    if (current.auth.type === "database") {
      initialValues.port = 5432;
    }
    setFormValues(initialValues);
    
    // Create a clean config object to avoid mutating state ref
    const config: IntegrationUiConfig = {
      id: current.id,
      name: current.name,
      category: current.category,
      logoUrl: current.logoUrl,
      description: current.description,
      connectionMode: current.connectionMode,
      auth: current.auth,
    };
    setActive(config);
  }, [integrations, load]);

  const closeModal = React.useCallback(() => {
    setActive(null);
    setFormValues({});
    setFormError(null);
    setSubmitting(false);
    setDisconnectMode(false);
  }, []);

  React.useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, closeModal]);

  const submit = React.useCallback(async () => {
    if (!active) return;
    setSubmitting(true);
    setFormError(null);

    try {
      // Zero input delay
      if (active.connectionMode === "zero_input") {
         await new Promise((r) => setTimeout(r, 800));
      }

      await safeFetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          integrationId: active.id,
          credentials: formValues,
        }),
      });

      // If OAuth, redirect to start flow
      if (active.connectionMode === "oauth") {
         setIsConnecting(true);
         const oauthUrl = await startOAuthFlow({
            providerId: active.id,
            currentPath: window.location.pathname + window.location.search,
            integrationMode: "manual",
         });
         router.push(oauthUrl);
         return; // Don't close modal or reload, we are leaving
      }

      closeModal();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
      setIsConnecting(false);
    }
  }, [active, closeModal, formValues, load]);

  const disconnect = React.useCallback(async () => {
    if (!active) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await safeFetch(`/api/integrations/${encodeURIComponent(active.id)}`, {
        method: "DELETE",
      });
      closeModal();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }, [active, closeModal, load]);

  // Zero Input Auto-Submit
  React.useEffect(() => {
    if (active?.connectionMode === "zero_input" && !activeStatus?.connected && !submitting && !formError) {
      void submit();
    }
  }, [active, activeStatus, submitting, formError, submit]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
        <p className="text-muted-foreground">Connect your tools to power real, live dashboards</p>
      </div>

      {isConnecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-lg font-medium">Connecting integration... you’ll be returned automatically.</p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:max-w-sm">
          <Input
            placeholder="Search integrations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          {["all", "connected", "not_connected"].map((m) => (
            <Button
              key={m}
              type="button"
              variant={filter === m ? "default" : "outline"}
              onClick={() => setFilter(m as FilterMode)}
              className="capitalize"
            >
              {m.replace("_", " ")}
            </Button>
          ))}
        </div>
      </div>

      {pageError ? (
        <div className="rounded-md border border-border bg-destructive/10 p-4 text-sm text-destructive">
          {pageError}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {(loading ? Array.from({ length: 6 }) : visible).map((item, idx) => {
          if (loading) {
            return (
              <Card key={`skeleton-${idx}`} className="h-[140px] animate-pulse bg-muted/50">
                <CardHeader />
              </Card>
            );
          }

          const i = item as IntegrationListItem;
          return (
            <Card key={i.id} className="flex flex-col border border-border transition-colors hover:border-foreground/20">
              <CardHeader className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-background p-1">
                      <Image
                        src={i.logoUrl}
                        alt=""
                        width={32}
                        height={32}
                        className="h-full w-full object-contain"
                        unoptimized
                      />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">{i.name}</CardTitle>
                      <CardDescription className="truncate">{i.category}</CardDescription>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className={`h-2 w-2 rounded-full ${statusDotClass(i.status)}`} />
                    {statusLabel(i.status, i.connected)}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 pt-2">
                  <div className="text-xs text-muted-foreground truncate">
                    {i.connected ? `Synced ${formatTimestamp(i.updatedAt || i.connectedAt || "")}` : "Ready to connect"}
                  </div>
                  <Button
                    type="button"
                    variant={i.connected ? "secondary" : "default"}
                    size="sm"
                    onClick={() => void openConnect(i.id)}
                  >
                    {i.connected ? "Manage" : "Connect"}
                  </Button>
                </div>
              </CardHeader>
            </Card>
          );
        })}
      </div>

      {active ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm transition-opacity"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="h-full w-full max-w-md border-l border-border bg-background p-6 shadow-2xl animate-in slide-in-from-right duration-300 overflow-y-auto">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                 <Image
                    src={active.logoUrl}
                    alt=""
                    width={20}
                    height={20}
                    className="h-5 w-5 object-contain"
                    unoptimized
                  />
                {active.name}
              </h2>
              <p className="text-sm text-muted-foreground">{active.description}</p>
            </div>

            <div className="mt-8 space-y-6">
              {activeStatus?.connected ? (
                <div className={`rounded-md border p-3 text-sm ${
                    activeStatus.status === "error" 
                    ? "border-destructive/20 bg-destructive/10 text-destructive" 
                    : "border-border bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                }`}>
                   {activeStatus.status === "error" ? "⚠ Connection Error" : "✓ Connected"} since {activeStatus.connectedAt ? formatTimestamp(activeStatus.connectedAt) : "just now"}
                </div>
              ) : null}

              {formError ? (
                <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                  {formError}
                </div>
              ) : null}

              {/* MODE SPECIFIC UI */}
              
              {/* Zero Input */}
              {active.connectionMode === "zero_input" && !activeStatus?.connected ? (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
                   <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                   <p className="text-sm text-muted-foreground">Connecting to {active.name}...</p>
                </div>
              ) : null}

              {/* Generic Form (Guided / Advanced / OAuth with fields) */}
              {(active.connectionMode === "guided" || active.connectionMode === "advanced" || active.connectionMode === "oauth") && !activeStatus?.connected ? (
                <form 
                  onSubmit={(e) => { e.preventDefault(); void submit(); }}
                  className="space-y-4"
                >
                  {/* OAuth BYOO Info */}
                  {active.connectionMode === "oauth" && (
                     <div className="text-xs text-muted-foreground bg-muted p-3 rounded space-y-2 mb-4 border border-border">
                        <p className="font-semibold text-foreground">Bring Your Own App (BYOO)</p>
                        <p>
                          To connect {active.name}, you must create an OAuth App in their developer portal.
                        </p>
                        <div className="space-y-1">
                          <p className="font-medium">Redirect URI:</p>
                          <code className="block bg-background p-2 rounded border border-border select-all break-all">
                            {origin}/api/oauth/callback/{active.id}
                          </code>
                        </div>
                     </div>
                  )}

                  {"fields" in active.auth && active.auth.fields && active.auth.fields.map((f) => (
                    <FieldRenderer 
                      key={f.id} 
                      field={f} 
                      value={formValues[f.id]} 
                      onChange={(val) => setFormValues(prev => ({ ...prev, [f.id]: val }))}
                    />
                  ))}

                  {"advancedFields" in active.auth && active.auth.advancedFields && active.auth.advancedFields.length > 0 && (
                    <div className="pt-2">
                       <button
                         type="button"
                         onClick={() => setAdvancedOpen(!advancedOpen)}
                         className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                       >
                         {advancedOpen ? "Hide" : "Show"} Advanced Options
                       </button>
                       {advancedOpen && (
                         <div className="mt-3 space-y-4 border-l-2 border-border pl-4">
                           {active.auth.advancedFields.map((f) => (
                              <FieldRenderer 
                                key={f.id} 
                                field={f} 
                                value={formValues[f.id]} 
                                onChange={(val) => setFormValues(prev => ({ ...prev, [f.id]: val }))}
                              />
                           ))}
                         </div>
                       )}
                    </div>
                  )}

                  <div className="pt-4 flex justify-end">
                     <Button type="submit" disabled={submitting}>
                       {submitting ? "Processing..." : active.connectionMode === "oauth" ? "Connect & Authorize" : "Connect"}
                     </Button>
                  </div>
                </form>
              ) : null}


              {/* Disconnect / Close Logic */}
              <div className="border-t border-border pt-6 flex items-center justify-between">
                <Button type="button" variant="ghost" onClick={closeModal} disabled={submitting}>
                  Close
                </Button>

                {activeStatus?.connected && (
                  <div className="flex items-center gap-2">
                    {disconnectMode ? (
                       <>
                         <Button 
                           type="button" 
                           variant="destructive" 
                           onClick={() => void disconnect()}
                           disabled={submitting}
                         >
                           Confirm Disconnect
                         </Button>
                       </>
                    ) : (
                      <Button 
                        type="button" 
                        variant="outline" 
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => setDisconnectMode(true)}
                        disabled={submitting}
                      >
                        Disconnect
                      </Button>
                    )}
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
