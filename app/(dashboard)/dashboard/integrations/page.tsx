"use client";

import * as React from "react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type IntegrationListItem = {
  id: string;
  name: string;
  category: string;
  logoUrl: string;
  description: string;
  auth: IntegrationAuthSchema;
  connected: boolean;
  connectedAt: string | null;
  updatedAt: string | null;
};

type FilterMode = "all" | "connected" | "not_connected";

type IntegrationAuthSchema =
  | { type: "api_key"; fields: FieldDef[] }
  | { type: "database"; fields: FieldDef[] }
  | { type: "oauth"; scopes: string[] }
  | { type: "none" };

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

type IntegrationUiConfig = {
  id: string;
  name: string;
  category: string;
  logoUrl: string;
  description: string;
  auth: IntegrationAuthSchema;
};

function statusDotClass(connected: boolean) {
  return connected ? "bg-emerald-500" : "bg-muted-foreground/50";
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
  const [disconnectConfirm, setDisconnectConfirm] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setPageError(null);
    try {
      const res = await fetch("/api/integrations", { method: "GET" });
      const json = (await res.json().catch(() => null)) as unknown;
      if (!res.ok || !json || typeof json !== "object") {
        throw new Error("Failed to load integrations");
      }
      const list = (json as { integrations?: IntegrationListItem[] }).integrations;
      if (!Array.isArray(list)) throw new Error("Failed to load integrations");
      setIntegrations(list);
    } catch (err) {
      setPageError(safeJsonMessage(err));
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
    setDisconnectConfirm(false);
    setSubmitting(false);

    const current = integrations.find((i) => i.id === integrationId);
    if (!current) return;

    const initialValues: Record<string, unknown> = {};
    if (current.auth.type === "database") {
      initialValues.port = 5432;
      initialValues.ssl = true;
    }
    setFormValues(initialValues);
    setActive({
      id: current.id,
      name: current.name,
      category: current.category,
      logoUrl: current.logoUrl,
      description: current.description,
      auth: current.auth,
    });
  }, [integrations]);

  const closeModal = React.useCallback(() => {
    setActive(null);
    setFormValues({});
    setFormError(null);
    setSubmitting(false);
    setDisconnectMode(false);
    setDisconnectConfirm(false);
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
      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          integrationId: active.id,
          credentials: formValues,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          json && typeof json === "object" && "error" in json && typeof (json as { error?: unknown }).error === "string"
            ? (json as { error: string }).error
            : "Failed to connect";
        throw new Error(msg);
      }
      closeModal();
      await load();
    } catch (err) {
      setFormError(safeJsonMessage(err));
    } finally {
      setSubmitting(false);
    }
  }, [active, closeModal, formValues, load]);

  const disconnect = React.useCallback(async () => {
    if (!active) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/integrations/${encodeURIComponent(active.id)}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          json && typeof json === "object" && "error" in json && typeof (json as { error?: unknown }).error === "string"
            ? (json as { error: string }).error
            : "Failed to disconnect";
        throw new Error(msg);
      }
      closeModal();
      await load();
    } catch (err) {
      setFormError(safeJsonMessage(err));
    } finally {
      setSubmitting(false);
    }
  }, [active, closeModal, load]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:max-w-sm">
          <Input
            placeholder="Search integrations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={filter === "all" ? "default" : "outline"}
            onClick={() => setFilter("all")}
          >
            All
          </Button>
          <Button
            type="button"
            variant={filter === "connected" ? "default" : "outline"}
            onClick={() => setFilter("connected")}
          >
            Connected
          </Button>
          <Button
            type="button"
            variant={filter === "not_connected" ? "default" : "outline"}
            onClick={() => setFilter("not_connected")}
          >
            Not Connected
          </Button>
        </div>
      </div>

      {pageError ? (
        <div className="rounded-md border border-border bg-card p-4 text-sm">
          {pageError}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {(loading ? Array.from({ length: 6 }) : visible).map((item, idx) => {
          if (loading) {
            return (
              <Card key={`skeleton-${idx}`} className="h-[140px]">
                <CardHeader />
              </Card>
            );
          }

          const i = item as IntegrationListItem;
          return (
            <Card key={i.id} className="flex flex-col border border-border">
              <CardHeader className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background">
                      <Image
                        src={i.logoUrl}
                        alt=""
                        width={24}
                        height={24}
                        className="h-6 w-6 object-contain"
                        unoptimized
                      />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">{i.name}</CardTitle>
                      <CardDescription className="truncate">{i.category}</CardDescription>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className={`h-2 w-2 rounded-full ${statusDotClass(i.connected)}`} />
                    {i.connected ? "Connected" : "Not connected"}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs text-muted-foreground">
                    {i.connectedAt ? `Connected ${formatTimestamp(i.connectedAt)}` : " "}
                  </div>
                  <Button
                    type="button"
                    variant={i.connected ? "secondary" : "default"}
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
          className="fixed inset-0 z-50 flex justify-end bg-black/30"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="h-full w-full max-w-md border-l border-border bg-background p-6">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">{active.name}</h2>
              <p className="text-sm text-muted-foreground">{active.description}</p>
            </div>

            <div className="mt-6 space-y-4">
              {activeStatus?.connected ? (
                <div className="rounded-md border border-border bg-card p-3 text-sm text-muted-foreground">
                  Connected{activeStatus.connectedAt ? ` · ${formatTimestamp(activeStatus.connectedAt)}` : ""}
                </div>
              ) : null}

              {formError ? (
                <div className="rounded-md border border-border bg-card p-3 text-sm">
                  {formError}
                </div>
              ) : null}

              {active.auth.type === "none" ? (
                <div className="rounded-md border border-border bg-card p-3 text-sm text-muted-foreground">
                  This integration does not require credentials.
                </div>
              ) : active.auth.type === "oauth" ? (
                <div className="rounded-md border border-border bg-card p-3 text-sm text-muted-foreground">
                  OAuth is not configured for this integration.
                </div>
              ) : (
                <div className="space-y-3">
                  {active.auth.fields.map((f) => {
                    if (f.kind === "boolean") {
                      const checked = Boolean(formValues[f.id]);
                      return (
                        <label key={f.id} className="flex items-center justify-between gap-3 text-sm">
                          <span>{f.label}</span>
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={checked}
                            onChange={(e) =>
                              setFormValues((prev) => ({ ...prev, [f.id]: e.target.checked }))
                            }
                          />
                        </label>
                      );
                    }

                    const raw = formValues[f.id];
                    const value =
                      typeof raw === "string"
                        ? raw
                        : typeof raw === "number"
                          ? String(raw)
                          : "";
                    const inputType =
                      f.kind === "number" ? "number" : f.secret ? "password" : "text";

                    return (
                      <div key={f.id} className="space-y-1">
                        <label className="text-sm font-medium">{f.label}</label>
                        <Input
                          type={inputType}
                          value={value}
                          placeholder={f.placeholder}
                          onChange={(e) =>
                            setFormValues((prev) => ({
                              ...prev,
                              [f.id]:
                                f.kind === "number" ? Number(e.target.value) : e.target.value,
                            }))
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center justify-between gap-3 pt-2">
                <Button type="button" variant="outline" onClick={closeModal} disabled={submitting}>
                  Cancel
                </Button>

                <div className="flex items-center gap-2">
                  {activeStatus?.connected ? (
                    disconnectMode ? (
                      <>
                        <label className="flex items-center gap-2 text-sm text-muted-foreground">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={disconnectConfirm}
                            onChange={(e) => setDisconnectConfirm(e.target.checked)}
                            disabled={submitting}
                          />
                          Confirm
                        </label>
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={() => void disconnect()}
                          disabled={submitting || !disconnectConfirm}
                        >
                          Disconnect
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setDisconnectMode(true)}
                        disabled={submitting}
                      >
                        Disconnect
                      </Button>
                    )
                  ) : null}

                  <Button
                    type="button"
                    onClick={() => void submit()}
                    disabled={
                      submitting || active.auth.type === "none" || activeStatus?.connected === true
                    }
                  >
                    {submitting ? "Connecting..." : activeStatus?.connected ? "Connected" : "Connect"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
