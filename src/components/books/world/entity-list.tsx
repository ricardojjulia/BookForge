"use client";

import { useState } from "react";
import {
  ActionIcon, Alert, Button, Collapse, Group, NumberInput, Paper,
  Popover, Select, Stack, Text, Textarea, TextInput, Title,
} from "@mantine/core";
import { IconChevronDown, IconChevronUp, IconPlus, IconTrash } from "@tabler/icons-react";
import { fetchJson } from "@/lib/http/fetch-json";

type Field = {
  key: string;
  label: string;
  required?: boolean;
  multiline?: boolean;
  type?: "text" | "number";
};

type Chapter = { id: string; chapter_number: number; title: string | null };

type Props = {
  bookId: string;
  entityType: string;
  initial: Record<string, unknown>[];
  fields: Field[];
  displayName: (item: Record<string, unknown>) => string;
  displaySub?: (item: Record<string, unknown>) => string;
  chapters?: Chapter[];
};

const EMPTY = (fields: Field[]): Record<string, unknown> =>
  Object.fromEntries(fields.map((f) => [f.key, f.type === "number" ? "" : ""]));

export function EntityList({ bookId, entityType, initial, fields, displayName, displaySub, chapters }: Props) {
  const [items, setItems] = useState<Record<string, unknown>[]>(initial);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Record<string, unknown>>>({});
  const [newItem, setNewItem] = useState<Record<string, unknown>>(EMPTY(fields));
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const base = `/api/books/${bookId}/world/${entityType}`;

  function patch(id: string, key: string, value: unknown) {
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [key]: value } }));
  }

  function getValue(item: Record<string, unknown>, key: string) {
    return drafts[item.id as string]?.[key] ?? item[key] ?? "";
  }

  async function save(item: Record<string, unknown>) {
    const id = item.id as string;
    const changes = drafts[id];
    if (!changes || Object.keys(changes).length === 0) return;
    setSaving(id);
    setError(null);
    try {
      const res = await fetchJson<{ item: Record<string, unknown> }>(`${base}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      setItems((prev) => prev.map((x) => (x.id === id ? res.item : x)));
      setDrafts((prev) => { const next = { ...prev }; delete next[id]; return next; });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(null);
    }
  }

  async function remove(id: string) {
    setSaving(id);
    setError(null);
    try {
      await fetchJson(`${base}/${id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((x) => x.id !== id));
      if (expanded === id) setExpanded(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setSaving(null);
      setConfirmingDelete(null);
    }
  }

  async function create() {
    setSaving("new");
    setError(null);
    try {
      const res = await fetchJson<{ item: Record<string, unknown> }>(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newItem),
      });
      setItems((prev) => [...prev, res.item]);
      setNewItem(EMPTY(fields));
      setShowNew(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed.");
    } finally {
      setSaving(null);
    }
  }

  function renderField(field: Field, value: unknown, onChange: (v: unknown) => void) {
    if (field.type === "number") {
      return (
        <NumberInput
          key={field.key}
          label={field.label}
          value={value as number | ""}
          onChange={onChange}
          size="sm"
        />
      );
    }
    if (field.multiline) {
      return (
        <Textarea
          key={field.key}
          label={field.label}
          value={value as string}
          onChange={(e) => onChange(e.currentTarget.value)}
          autosize
          minRows={2}
          maxRows={8}
          size="sm"
        />
      );
    }
    return (
      <TextInput
        key={field.key}
        label={field.label}
        value={value as string}
        onChange={(e) => onChange(e.currentTarget.value)}
        required={field.required}
        size="sm"
      />
    );
  }

  return (
    <Stack gap="sm">
      {error && <Alert color="red" variant="light" onClose={() => setError(null)} withCloseButton>{error}</Alert>}

      {items.map((item) => {
        const id = item.id as string;
        const isOpen = expanded === id;
        const isDirty = id in drafts && Object.keys(drafts[id]).length > 0;
        return (
          <Paper key={id} withBorder radius="sm" p="md">
            <Group justify="space-between" wrap="nowrap">
              <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                <Text fw={600} truncate>{displayName(item)}</Text>
                {displaySub && <Text size="xs" c="dimmed" truncate>{displaySub(item)}</Text>}
              </Stack>
              <Group gap="xs" wrap="nowrap">
                {isDirty && (
                  <Button size="xs" color="grape" loading={saving === id} onClick={() => save(item)}>
                    Save
                  </Button>
                )}
                <Popover opened={confirmingDelete === id} onClose={() => setConfirmingDelete(null)} position="bottom-end" withArrow>
                  <Popover.Target>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size="sm"
                      loading={saving === id}
                      onClick={() => setConfirmingDelete(confirmingDelete === id ? null : id)}
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Popover.Target>
                  <Popover.Dropdown>
                    <Stack gap={6}>
                      <Text size="xs">Delete this entry?</Text>
                      <Group gap={6}>
                        <Button size="xs" color="red" loading={saving === id} onClick={() => remove(id)}>
                          Delete
                        </Button>
                        <Button size="xs" variant="subtle" color="gray" onClick={() => setConfirmingDelete(null)}>
                          Cancel
                        </Button>
                      </Group>
                    </Stack>
                  </Popover.Dropdown>
                </Popover>
                <ActionIcon variant="subtle" size="sm" onClick={() => setExpanded(isOpen ? null : id)}>
                  {isOpen ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                </ActionIcon>
              </Group>
            </Group>
            <Collapse expanded={isOpen}>
              <Stack gap="xs" mt="sm">
                {fields.map((field) =>
                  renderField(field, getValue(item, field.key), (v) => patch(id, field.key, v)),
                )}
                {chapters && entityType === "timeline" && (
                  <Select
                    label="Chapter"
                    clearable
                    value={(getValue(item, "chapter_id") as string) || null}
                    onChange={(v) => patch(id, "chapter_id", v)}
                    data={chapters.map((c) => ({
                      value: c.id,
                      label: `Ch. ${c.chapter_number}${c.title ? ` — ${c.title}` : ""}`,
                    }))}
                    size="sm"
                  />
                )}
              </Stack>
            </Collapse>
          </Paper>
        );
      })}

      <Collapse expanded={showNew}>
        <Paper withBorder radius="sm" p="md" bg="#f8f7ff">
          <Title order={5} mb="sm">New entry</Title>
          <Stack gap="xs">
            {fields.map((field) =>
              renderField(field, newItem[field.key] ?? "", (v) =>
                setNewItem((prev) => ({ ...prev, [field.key]: v })),
              ),
            )}
          </Stack>
          <Group mt="sm">
            <Button size="sm" color="grape" loading={saving === "new"} onClick={create}>Add</Button>
            <Button size="sm" variant="subtle" color="gray" onClick={() => { setShowNew(false); setNewItem(EMPTY(fields)); }}>Cancel</Button>
          </Group>
        </Paper>
      </Collapse>

      <Button
        leftSection={<IconPlus size={14} />}
        variant="light"
        color="grape"
        size="sm"
        onClick={() => setShowNew(true)}
        style={{ alignSelf: "flex-start" }}
      >
        Add entry
      </Button>
    </Stack>
  );
}
