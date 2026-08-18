"use client";

import { useState } from "react";
import { Alert, Badge, Button, Group, Paper, Stack, Text, TextInput } from "@mantine/core";
import { fetchJson } from "@/lib/http/fetch-json";

type Account = {
  id: string;
  email: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  bannedUntil: string | null;
  deletionStatus: "pending" | "ready_for_purge" | null;
  purgeAfter: string | null;
};

export function StewardAccountsClient({ initialAccounts }: { initialAccounts: Account[] }) {
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

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

  return (
    <Stack gap="md">
      <Group>
        <TextInput
          placeholder="Search by email"
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          onKeyDown={(event) => { if (event.key === "Enter") void load(search); }}
          style={{ flex: 1 }}
        />
        <Button variant="light" color="grape" loading={loading} onClick={() => load(search)}>Search</Button>
      </Group>

      {error && <Alert color="red">{error}</Alert>}
      {message && <Alert color="green">{message}</Alert>}

      {!loading && !accounts.length && <Text c="dimmed">No accounts found.</Text>}

      <Stack gap="xs">
        {accounts.map((account) => (
          <Paper key={account.id} withBorder radius="md" p="md">
            <Group justify="space-between" align="flex-start" wrap="wrap">
              <div>
                <Group gap="xs">
                  <Text fw={700}>{account.email || account.id}</Text>
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
              {account.deletionStatus && (
                <Group gap="xs">
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
                </Group>
              )}
            </Group>
          </Paper>
        ))}
      </Stack>
    </Stack>
  );
}
