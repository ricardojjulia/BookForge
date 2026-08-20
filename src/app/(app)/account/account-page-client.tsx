"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  Paper,
  PasswordInput,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { createClient } from "@/lib/supabase/client";

type BillingTier = { id: string; display_name: string; monthly_price_usd_cents: number };
type BillingInfo = { tiers: BillingTier[]; currentTierId: string | null; balanceUsdMicros: number | null } | null;
type Props = { email: string; displayName: string; billing: BillingInfo };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Paper withBorder radius="md" p="lg" mb="md">
      <Title order={4} mb="md">{title}</Title>
      {children}
    </Paper>
  );
}

function BillingSection({ billing }: { billing: NonNullable<BillingInfo> }) {
  const [loadingTierId, setLoadingTierId] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function redirectTo(path: string, body?: unknown) {
    setError(null);
    try {
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || "Failed.");
      window.location.assign(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
      setLoadingTierId(null);
      setPortalLoading(false);
    }
  }

  const currentTier = billing.tiers.find((t) => t.id === billing.currentTierId);

  return (
    <Section title="Billing">
      {error && <Alert color="red" mb="sm">{error}</Alert>}
      {currentTier ? (
        <Stack gap="sm">
          <Group>
            <Text size="sm">
              Current plan: <strong>{currentTier.display_name}</strong> (${(currentTier.monthly_price_usd_cents / 100).toFixed(2)}/mo)
            </Text>
            <Badge color="green" variant="light">Active</Badge>
          </Group>
          {billing.balanceUsdMicros !== null && (
            <Text size="sm" c="dimmed">Credit balance: ${(billing.balanceUsdMicros / 1_000_000).toFixed(2)}</Text>
          )}
          <Group>
            <Button
              color="grape"
              loading={portalLoading}
              onClick={() => { setPortalLoading(true); redirectTo("/api/billing/portal"); }}
            >
              Manage billing
            </Button>
          </Group>
        </Stack>
      ) : (
        <Stack gap="sm">
          <Text size="sm" c="dimmed">Choose a plan to get started.</Text>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            {billing.tiers.map((tier) => (
              <Card key={tier.id} withBorder radius="md" p="md">
                <Text fw={600}>{tier.display_name}</Text>
                <Text size="sm" c="dimmed" mb="sm">${(tier.monthly_price_usd_cents / 100).toFixed(2)}/mo</Text>
                <Button
                  fullWidth
                  color="grape"
                  loading={loadingTierId === tier.id}
                  onClick={() => { setLoadingTierId(tier.id); redirectTo("/api/billing/checkout", { tierId: tier.id }); }}
                >
                  Subscribe
                </Button>
              </Card>
            ))}
          </SimpleGrid>
        </Stack>
      )}
    </Section>
  );
}

export function AccountPageClient({ email, displayName, billing }: Props) {
  const router = useRouter();
  const supabase = createClient();

  // Profile
  const [name, setName] = useState(displayName);
  const [nameLoading, setNameLoading] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Email
  const [newEmail, setNewEmail] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Password
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Delete
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function saveName() {
    setNameLoading(true);
    setNameMsg(null);
    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed.");
      setNameMsg({ ok: true, text: "Display name saved." });
      router.refresh();
    } catch (e) {
      setNameMsg({ ok: false, text: e instanceof Error ? e.message : "Failed." });
    } finally {
      setNameLoading(false);
    }
  }

  async function changeEmail() {
    if (!newEmail) return;
    setEmailLoading(true);
    setEmailMsg(null);
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail });
      if (error) throw error;
      setEmailMsg({ ok: true, text: "Confirmation email sent to both addresses. Check your inbox." });
      setNewEmail("");
    } catch (e) {
      setEmailMsg({ ok: false, text: e instanceof Error ? e.message : "Failed." });
    } finally {
      setEmailLoading(false);
    }
  }

  async function changePassword() {
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ ok: false, text: "Passwords do not match." });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordMsg({ ok: false, text: "Password must be at least 8 characters." });
      return;
    }
    setPasswordLoading(true);
    setPasswordMsg(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setPasswordMsg({ ok: true, text: "Password updated." });
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      setPasswordMsg({ ok: false, text: e instanceof Error ? e.message : "Failed." });
    } finally {
      setPasswordLoading(false);
    }
  }

  async function deleteAccount() {
    if (deleteConfirm !== "DELETE") return;
    setDeleteLoading(true);
    setDeleteMsg(null);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed.");
      await supabase.auth.signOut();
      router.push("/auth");
    } catch (e) {
      setDeleteMsg({ ok: false, text: e instanceof Error ? e.message : "Failed." });
      setDeleteLoading(false);
    }
  }

  return (
    <Stack gap={0}>
      {billing && <BillingSection billing={billing} />}

      <Section title="Profile">
        <TextInput
          label="Display name"
          description="Shown on shared books and collaboration panels."
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          mb="sm"
        />
        {nameMsg && <Alert color={nameMsg.ok ? "green" : "red"} mb="sm">{nameMsg.text}</Alert>}
        <Button onClick={saveName} loading={nameLoading} color="grape">
          Save name
        </Button>
      </Section>

      <Section title="Email">
        <Text size="sm" c="dimmed" mb="sm">Current: <strong>{email}</strong></Text>
        <TextInput
          label="New email address"
          type="email"
          placeholder="new@example.com"
          value={newEmail}
          onChange={(e) => setNewEmail(e.currentTarget.value)}
          mb="sm"
        />
        {emailMsg && <Alert color={emailMsg.ok ? "green" : "red"} mb="sm">{emailMsg.text}</Alert>}
        <Button onClick={changeEmail} loading={emailLoading} disabled={!newEmail} color="grape">
          Change email
        </Button>
      </Section>

      <Section title="Password">
        <PasswordInput
          label="New password"
          placeholder="At least 8 characters"
          value={newPassword}
          onChange={(e) => setNewPassword(e.currentTarget.value)}
          mb="sm"
        />
        <PasswordInput
          label="Confirm new password"
          placeholder="Repeat password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.currentTarget.value)}
          mb="sm"
        />
        {passwordMsg && <Alert color={passwordMsg.ok ? "green" : "red"} mb="sm">{passwordMsg.text}</Alert>}
        <Button onClick={changePassword} loading={passwordLoading} disabled={!newPassword} color="grape">
          Change password
        </Button>
      </Section>

      <Paper withBorder radius="md" p="lg" mb="md" style={{ borderColor: "var(--mantine-color-red-4)" }}>
        <Title order={4} c="red" mb="md">Danger Zone</Title>
        <Text size="sm" mb="sm">
          Deleting your account blocks sign-in immediately, but your books, manuscripts, reports, and
          exports are kept for 30 days before permanent removal. Changed your mind? Contact support
          before then — since sign-in is blocked, this isn&apos;t something you can undo yourself.
        </Text>
        <Divider mb="sm" />
        <TextInput
          label='Type DELETE to confirm'
          placeholder="DELETE"
          value={deleteConfirm}
          onChange={(e) => setDeleteConfirm(e.currentTarget.value)}
          mb="sm"
        />
        {deleteMsg && <Alert color="red" mb="sm">{deleteMsg.text}</Alert>}
        <Group>
          <Button
            color="red"
            variant="filled"
            disabled={deleteConfirm !== "DELETE"}
            loading={deleteLoading}
            onClick={deleteAccount}
          >
            Delete my account
          </Button>
        </Group>
      </Paper>
    </Stack>
  );
}
