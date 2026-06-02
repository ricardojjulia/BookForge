"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  ActionIcon,
  CopyButton,
  Tooltip,
  Loader,
} from "@mantine/core";
import { IconCopy, IconCheck, IconTrash, IconUserPlus } from "@tabler/icons-react";

type Collaborator = {
  id: string;
  user_id: string;
  role: "viewer" | "editor" | "admin";
  created_at: string;
  profiles: { display_name: string | null; email: string | null } | null;
};

type Invite = {
  id: string;
  email: string;
  role: "viewer" | "editor" | "admin";
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
};

const ROLE_COLORS: Record<string, string> = { viewer: "blue", editor: "green", admin: "grape" };
const ROLES = [
  { value: "viewer", label: "Viewer — read only" },
  { value: "editor", label: "Editor — can edit chapters" },
  { value: "admin", label: "Admin — full access" },
];

export function CollaborationPanel({ bookId }: { bookId: string }) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("editor");
  const [inviting, setInviting] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteEmailSent, setInviteEmailSent] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [collabRes, inviteRes] = await Promise.all([
        fetch(`/api/books/${bookId}/collaborators`),
        fetch(`/api/books/${bookId}/invite`),
      ]);
      const collabData = await collabRes.json();
      const inviteData = await inviteRes.json();
      if (collabData.error) throw new Error(collabData.error);
      if (inviteData.error) throw new Error(inviteData.error);
      setCollaborators(collabData.collaborators || []);
      setInvites((inviteData.invites || []).filter((i: Invite) => !i.accepted_at));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [load]);

  async function sendInvite() {
    setInviting(true);
    setInviteError(null);
    setInviteUrl(null);
    setInviteEmailSent(false);
    try {
      const res = await fetch(`/api/books/${bookId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setInviteUrl(data.inviteUrl);
      setInviteEmailSent(data.emailSent ?? false);
      setEmail("");
      void load();
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : "Failed to send invite.");
    } finally {
      setInviting(false);
    }
  }

  async function changeRole(collaboratorId: string, newRole: string) {
    await fetch(`/api/books/${bookId}/collaborators/${collaboratorId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    void load();
  }

  async function removeCollaborator(collaboratorId: string) {
    if (!confirm("Remove this collaborator?")) return;
    await fetch(`/api/books/${bookId}/collaborators/${collaboratorId}`, { method: "DELETE" });
    void load();
  }

  if (loading) return <Loader size="sm" />;
  if (error) return <Alert color="red">{error}</Alert>;

  const pendingInvites = invites.filter((i) => new Date(i.expires_at) > new Date());

  return (
    <Stack gap="xl">
      <div>
        <Title order={4} mb="sm">Invite someone</Title>
        <Paper withBorder p="md" radius="md">
          <Stack gap="sm">
            <Group grow>
              <TextInput
                placeholder="colleague@example.com"
                label="Email address"
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
                type="email"
              />
              <Select
                label="Role"
                data={ROLES}
                value={role}
                onChange={(v) => setRole(v || "editor")}
              />
            </Group>
            <Group>
              <Button
                leftSection={<IconUserPlus size={16} />}
                onClick={sendInvite}
                loading={inviting}
                disabled={!email.includes("@")}
              >
                Send invite
              </Button>
            </Group>
            {inviteError && <Alert color="red" py="xs">{inviteError}</Alert>}
            {inviteUrl && (
              <Alert color="green" title={inviteEmailSent ? "Invite sent" : "Invite link created"}>
                <Text size="sm" mb="xs">
                  {inviteEmailSent
                    ? "An invitation email is on its way. You can also share the link directly:"
                    : "Share this link — it expires in 7 days."}
                </Text>
                <Group gap="xs">
                  <Text size="xs" ff="monospace" style={{ wordBreak: "break-all" }}>{inviteUrl}</Text>
                  <CopyButton value={inviteUrl} timeout={2000}>
                    {({ copied, copy }) => (
                      <Tooltip label={copied ? "Copied" : "Copy link"} withArrow>
                        <ActionIcon size="sm" color={copied ? "teal" : "gray"} variant="subtle" onClick={copy}>
                          {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </CopyButton>
                </Group>
              </Alert>
            )}
          </Stack>
        </Paper>
      </div>

      {pendingInvites.length > 0 && (
        <div>
          <Title order={4} mb="sm">Pending invites</Title>
          <Stack gap="xs">
            {pendingInvites.map((invite) => (
              <Paper key={invite.id} withBorder p="sm" radius="md">
                <Group justify="space-between">
                  <div>
                    <Text size="sm" fw={500}>{invite.email}</Text>
                    <Text size="xs" c="dimmed">
                      Expires {new Date(invite.expires_at).toLocaleDateString()}
                    </Text>
                  </div>
                  <Badge color={ROLE_COLORS[invite.role]} variant="light">{invite.role}</Badge>
                </Group>
              </Paper>
            ))}
          </Stack>
        </div>
      )}

      <div>
        <Title order={4} mb="sm">
          Collaborators {collaborators.length > 0 && <Text span c="dimmed" fw={400} size="sm">({collaborators.length})</Text>}
        </Title>
        {collaborators.length === 0 ? (
          <Text c="dimmed" size="sm">No collaborators yet.</Text>
        ) : (
          <Stack gap="xs">
            {collaborators.map((c) => (
              <Paper key={c.id} withBorder p="sm" radius="md">
                <Group justify="space-between">
                  <div>
                    <Text size="sm" fw={500}>{c.profiles?.display_name || c.profiles?.email || c.user_id}</Text>
                    {c.profiles?.email && c.profiles?.display_name && (
                      <Text size="xs" c="dimmed">{c.profiles.email}</Text>
                    )}
                  </div>
                  <Group gap="xs">
                    <Select
                      size="xs"
                      data={ROLES.map((r) => ({ value: r.value, label: r.value }))}
                      value={c.role}
                      onChange={(v) => v && changeRole(c.id, v)}
                      w={90}
                    />
                    <ActionIcon
                      color="red"
                      variant="subtle"
                      size="sm"
                      onClick={() => removeCollaborator(c.id)}
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Group>
                </Group>
              </Paper>
            ))}
          </Stack>
        )}
      </div>

      <Divider />
      <Text size="xs" c="dimmed">
        Only the book owner can manage collaborators and roles. Viewers can read but not edit; Editors can modify chapters; Admins have full access except ownership transfer.
      </Text>
    </Stack>
  );
}
