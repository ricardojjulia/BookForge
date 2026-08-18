"use client";

import { useState } from "react";
import { Alert, Badge, Button, Collapse, Group, Paper, PasswordInput, Stack, Text, TextInput } from "@mantine/core";
import { fetchJson } from "@/lib/http/fetch-json";

type Account = {
  id: string;
  email: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  bannedUntil: string | null;
  deletionStatus: "pending" | "ready_for_purge" | null;
  purgeAfter: string | null;
  platformRole: string | null;
};

export function StewardAccountsClient({ initialAccounts, currentUserId }: { initialAccounts: Account[]; currentUserId: string }) {
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [creating, setCreating] = useState(false);

  async function load(query: string) {
    setLoading(true);
    setError("");
    try {
      const result = await fetchJson<{ accounts: Account[] }>(
        `/api/steward/accounts${query ? `?search=${encodeURIComponent(query)}` : ""}`,
        {},
        "Load accounts",
      );
      setAccounts(result.accounts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load accounts.");
    } finally {
      setLoading(false);
    }
  }

  async function createAccount() {
    setCreating(true);
    setError("");
    setMessage("");
    try {
      await fetchJson(
        "/api/steward/accounts/create",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: newEmail, password: newPassword, displayName: newDisplayName || undefined }),
        },
        "Create account",
      );
      setMessage(`Account created for ${newEmail}.`);
      setNewEmail("");
      setNewPassword("");
      setNewDisplayName("");
      setShowCreate(false);
      await load(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create account.");
    } finally {
      setCreating(false);
    }
  }

  async function restore(accountId: string) {
    setActionLoading(accountId);
    setError("");
    setMessage("");
    try {
      await fetchJson(`/api/steward/accounts/${accountId}/restore`, { method: "POST" }, "Restore account");
      setMessage("Account restored — sign-in re-enabled.");
      await load(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to restore account.");
    } finally {
      setActionLoading(null);
    }
  }

  async function extend(accountId: string) {
    setActionLoading(accountId);
    setError("");
    setMessage("");
    try {
      await fetchJson(
        `/api/steward/accounts/${accountId}/extend`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ extendByDays: 14 }) },
        "Extend retention window",
      );
      setMessage("Retention window extended by 14 days.");
      await load(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to extend retention window.");
    } finally {
      setActionLoading(null);
    }
  }

  async function purge(accountId: string, email: string | null) {
    if (!window.confirm(`Permanently delete ${email || accountId} and everything they own? This cannot be undone.`)) return;
    setActionLoading(accountId);
    setError("");
    setMessage("");
    try {
      await fetchJson(`/api/steward/accounts/${accountId}/purge`, { method: "POST" }, "Purge account");
      setMessage("Account permanently deleted.");
      await load(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to purge account.");
    } finally {
      setActionLoading(null);
    }
  }

  async function startDeletion(accountId: string, email: string | null) {
    if (!window.confirm(`Start the 30-day deletion process for ${email || accountId}? This blocks their sign-in immediately.`)) return;
    setActionLoading(accountId);
    setError("");
    setMessage("");
    try {
      await fetchJson(`/api/steward/accounts/${accountId}/delete`, { method: "POST" }, "Start account deletion");
      setMessage("Deletion started — sign-in blocked, recoverable for 30 days.");
      await load(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start deletion.");
    } finally {
      setActionLoading(null);
    }
  }

  async function forceDelete(accountId: string, email: string | null) {
    const confirmText = window.prompt(
      `This immediately and permanently deletes ${email || accountId} and everything they own, skipping the 30-day recovery window. This cannot be undone.\n\nType DELETE to confirm.`,
    );
    if (confirmText !== "DELETE") return;
    setActionLoading(accountId);
    setError("");
    setMessage("");
    try {
      await fetchJson(`/api/steward/accounts/${accountId}/force-delete`, { method: "POST" }, "Force-delete account");
      setMessage("Account permanently deleted.");
      await load(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete account.");
    } finally {
      setActionLoading(null);
    }
  }

  async function toggleRole(accountId: string, currentRole: string | null, email: string | null) {
    const grant = currentRole !== "steward";
    const confirmMessage = grant
      ? `Grant Steward access to ${email || accountId}? They will be able to view/manage any book and other accounts.`
      : `Revoke Steward access from ${email || accountId}?`;
    if (!window.confirm(confirmMessage)) return;
    setActionLoading(accountId);
    setError("");
    setMessage("");
    try {
      await fetchJson(
        `/api/steward/accounts/${accountId}/role`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platformRole: grant ? "steward" : null }) },
        "Change Steward role",
      );
      setMessage(grant ? "Steward access granted." : "Steward access revoked.");
      await load(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to change role.");
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Group style={{ flex: 1 }}>
          <TextInput
            placeholder="Search by email"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            onKeyDown={(event) => { if (event.key === "Enter") void load(search); }}
            style={{ flex: 1 }}
          />
          <Button variant="light" color="grape" loading={loading} onClick={() => load(search)}>Search</Button>
        </Group>
        <Button variant="light" color="teal" onClick={() => setShowCreate((current) => !current)}>
          {showCreate ? "Cancel" : "Create account"}
        </Button>
      </Group>

      <Collapse expanded={showCreate}>
        <Paper withBorder radius="md" p="md">
          <Stack gap="sm">
            <TextInput label="Email" value={newEmail} onChange={(event) => setNewEmail(event.currentTarget.value)} />
            <PasswordInput label="Password" description="At least 8 characters" value={newPassword} onChange={(event) => setNewPassword(event.currentTarget.value)} />
            <TextInput label="Display name (optional)" value={newDisplayName} onChange={(event) => setNewDisplayName(event.currentTarget.value)} />
            <Button color="teal" loading={creating} disabled={!newEmail || newPassword.length < 8} onClick={createAccount} style={{ alignSelf: "flex-start" }}>
              Create account
            </Button>
          </Stack>
        </Paper>
      </Collapse>

      {error && <Alert color="red">{error}</Alert>}
      {message && <Alert color="green">{message}</Alert>}

      {!loading && !accounts.length && <Text c="dimmed">No accounts found.</Text>}

      <Stack gap="xs">
        {accounts.map((account) => {
          const isSelf = account.id === currentUserId;
          return (
            <Paper key={account.id} withBorder radius="md" p="md">
              <Group justify="space-between" align="flex-start" wrap="wrap">
                <div>
                  <Group gap="xs">
                    <Text fw={700}>{account.email || account.id}</Text>
                    {account.platformRole === "steward" && <Badge color="grape" variant="light">Steward</Badge>}
                    {account.bannedUntil && <Badge color="red" variant="light">Banned until {new Date(account.bannedUntil).toLocaleDateString()}</Badge>}
                    {account.deletionStatus === "pending" && <Badge color="yellow" variant="light">Pending deletion</Badge>}
                    {account.deletionStatus === "ready_for_purge" && <Badge color="red">Ready for purge</Badge>}
                  </Group>
                  <Text size="xs" c="dimmed">
                    Joined {account.createdAt ? new Date(account.createdAt).toLocaleDateString() : "unknown"}
                    {account.lastSignInAt ? ` · last sign-in ${new Date(account.lastSignInAt).toLocaleDateString()}` : ""}
                    {account.purgeAfter ? ` · purge scheduled ${new Date(account.purgeAfter).toLocaleDateString()}` : ""}
                  </Text>
                </div>
                <Group gap="xs">
                  {account.deletionStatus && (
                    <>
                      <Button size="xs" color="teal" variant="light" loading={actionLoading === account.id} onClick={() => restore(account.id)}>
                        Restore
                      </Button>
                      <Button size="xs" color="dark" variant="light" loading={actionLoading === account.id} onClick={() => extend(account.id)}>
                        Extend 14 days
                      </Button>
                      {account.deletionStatus === "ready_for_purge" && (
                        <Button size="xs" color="red" loading={actionLoading === account.id} onClick={() => purge(account.id, account.email)}>
                          Purge now
                        </Button>
                      )}
                    </>
                  )}
                  {!account.deletionStatus && (
                    <Button size="xs" color="yellow" variant="light" loading={actionLoading === account.id} onClick={() => startDeletion(account.id, account.email)}>
                      Start deletion
                    </Button>
                  )}
                  {!isSelf && (
                    <Button size="xs" color="grape" variant="light" loading={actionLoading === account.id} onClick={() => toggleRole(account.id, account.platformRole, account.email)}>
                      {account.platformRole === "steward" ? "Revoke Steward" : "Grant Steward"}
                    </Button>
                  )}
                  {!isSelf && (
                    <Button size="xs" color="red" variant="outline" loading={actionLoading === account.id} onClick={() => forceDelete(account.id, account.email)}>
                      Force delete
                    </Button>
                  )}
                </Group>
              </Group>
            </Paper>
          );
        })}
      </Stack>
    </Stack>
  );
}
