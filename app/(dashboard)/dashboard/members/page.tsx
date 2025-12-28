"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type OrgRole = "OWNER" | "EDITOR" | "VIEWER";

type MembersResponse = {
  me: { userId: string; role: OrgRole };
  members: Array<{
    userId: string;
    role: OrgRole;
    createdAt: string;
    email: string | null;
    name: string | null;
  }>;
};

function formatRole(role: OrgRole) {
  return role.slice(0, 1) + role.slice(1).toLowerCase();
}

function Select({
  value,
  onChange,
  disabled,
}: {
  value: OrgRole;
  onChange: (next: OrgRole) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as OrgRole)}
      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
    >
      <option value="OWNER">Owner</option>
      <option value="EDITOR">Editor</option>
      <option value="VIEWER">Viewer</option>
    </select>
  );
}

export default function MembersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [me, setMe] = React.useState<MembersResponse["me"] | null>(null);
  const [members, setMembers] = React.useState<MembersResponse["members"]>([]);
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<OrgRole>("VIEWER");
  const [inviteResult, setInviteResult] = React.useState<{
    acceptUrl?: string;
    expiresAt?: string;
  } | null>(null);

  const isOwner = me?.role === "OWNER";

  const loadMembers = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/org/members", { method: "GET" });
      const data = (await res.json().catch(() => null)) as
        | MembersResponse
        | { error?: string }
        | null;
      if (!res.ok) {
        throw new Error(
          data && "error" in data && typeof data.error === "string"
            ? data.error
            : "Failed to load members",
        );
      }
      if (!data || !("me" in data) || !("members" in data)) {
        throw new Error("Invalid response from server");
      }
      setMe(data.me);
      setMembers(data.members);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load members");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const acceptInvite = React.useCallback(
    async (token: string) => {
    setStatus("Accepting invite…");
    setError(null);
    try {
      const res = await fetch("/api/org/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to accept invite");
      }
      setStatus("Invite accepted.");
      router.replace("/dashboard/members");
      await loadMembers();
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : "Failed to accept invite");
    }
    },
    [loadMembers, router],
  );

  async function onCreateInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteResult(null);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/org/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const data = (await res.json().catch(() => null)) as
        | {
            invite?: {
              acceptUrl?: string;
              expiresAt?: string;
            };
            error?: string;
          }
        | null;
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to create invite");
      }
      setInviteEmail("");
      setInviteResult({
        acceptUrl: data?.invite?.acceptUrl,
        expiresAt: data?.invite?.expiresAt,
      });
      await loadMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invite");
    }
  }

  async function updateRole(userId: string, role: OrgRole) {
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/org/members/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = (await res.json().catch(() => null)) as
        | { member?: { userId: string; role: OrgRole }; error?: string }
        | null;
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to update role");
      }
      setMembers((prev) =>
        prev.map((m) =>
          m.userId === userId ? { ...m, role: data?.member?.role ?? role } : m,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update role");
    }
  }

  async function removeMember(userId: string) {
    setError(null);
    setStatus(null);
    const ok = window.confirm("Remove this member from the organization?");
    if (!ok) return;
    try {
      const res = await fetch(`/api/org/members/${encodeURIComponent(userId)}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to remove member");
      }
      await loadMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove member");
    }
  }

  React.useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  React.useEffect(() => {
    const token = searchParams.get("invite");
    if (token) void acceptInvite(token);
  }, [acceptInvite, searchParams]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            Organization members and their access level.
          </CardDescription>
          {me?.role === "VIEWER" ? (
            <div className="text-xs text-muted-foreground">Read-only access.</div>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          {status ? (
            <div className="text-sm text-muted-foreground">{status}</div>
          ) : null}
          {error ? (
            <div className="rounded-md border border-border bg-accent px-3 py-2 text-sm">
              {error}
            </div>
          ) : null}

          <div className="divide-y divide-border rounded-md border border-border">
            {members.map((m) => (
              <div
                key={m.userId}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {m.name ?? m.email ?? m.userId}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {m.email ?? "—"} · {formatRole(m.role)}
                    {me?.userId === m.userId ? " (you)" : ""}
                  </div>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                  {isOwner ? (
                    <div className="w-full sm:w-40">
                      <Select
                        value={m.role}
                        onChange={(next) => void updateRole(m.userId, next)}
                      />
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      {formatRole(m.role)}
                    </div>
                  )}
                  {isOwner && me?.userId !== m.userId ? (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => void removeMember(m.userId)}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={() => void loadMembers()} disabled={isLoading}>
              {isLoading ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {isOwner ? (
        <Card>
          <CardHeader>
            <CardTitle>Invite member</CardTitle>
            <CardDescription>
              Send an email invite. In dev, the accept link is returned.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <form onSubmit={onCreateInvite} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Email</div>
                  <Input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="teammate@company.com"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Role</div>
                  <Select
                    value={inviteRole}
                    onChange={(r) => setInviteRole(r)}
                  />
                </div>
              </div>
              <Button type="submit" disabled={inviteEmail.trim().length === 0}>
                Create invite
              </Button>
            </form>
            {inviteResult?.expiresAt ? (
              <div className="text-xs text-muted-foreground">
                Expires: {new Date(inviteResult.expiresAt).toLocaleString()}
              </div>
            ) : null}
            {inviteResult?.acceptUrl ? (
              <div className="rounded-md border border-border bg-accent px-3 py-2 text-sm">
                <div className="text-xs text-muted-foreground">
                  Dev accept link:
                </div>
                <a className="break-all underline" href={inviteResult.acceptUrl}>
                  {inviteResult.acceptUrl}
                </a>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
