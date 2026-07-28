"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Group, Paper, Select, SimpleGrid, Stack, Table, Text, Title } from "@mantine/core";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/http/fetch-json";
import { readSelectedMetadataSnapshot, writeSelectedMetadataSnapshot } from "@/lib/book-metadata/selection";

type Snapshot = {
  id: string;
  bookId: string;
  branchName: string;
  parentSnapshotId: string | null;
  status: "draft" | "active" | "archived";
  title: string;
  summary: string | null;
  metadataJson: Record<string, unknown>;
  sourceType: string;
  sourceRefId: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

type Branch = {
  id: string;
  bookId: string;
  name: string;
  headSnapshotId: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

type SnapshotListResponse = {
  snapshots: Snapshot[];
  branches: Branch[];
  unavailable?: boolean;
  reason?: string;
};

type SnapshotActionResponse = {
  snapshot?: Snapshot;
  branch?: Branch;
};

export function BookMetadataTimelinePanel({ bookId }: { bookId: string }) {
  const router = useRouter();
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [compareSnapshotId, setCompareSnapshotId] = useState<string | null>(null);

  const selectedSnapshot = useMemo(
    () => snapshots.find((snapshot) => snapshot.id === selectedSnapshotId) || snapshots.find((snapshot) => snapshot.status === "active") || snapshots[0] || null,
    [snapshots, selectedSnapshotId],
  );
  const compareSnapshot = useMemo(
    () => snapshots.find((snapshot) => snapshot.id === compareSnapshotId) || null,
    [compareSnapshotId, snapshots],
  );
  const compareRows = useMemo(() => {
    if (!selectedSnapshot || !compareSnapshot) return [];
    return buildSnapshotComparison(selectedSnapshot, compareSnapshot);
  }, [compareSnapshot, selectedSnapshot]);

  useEffect(() => {
    void loadSnapshots();
  }, [bookId]);

  useEffect(() => {
    if (!snapshots.length) return;
    const stored = readSelectedMetadataSnapshot();
    const storedSelection = stored && snapshots.some((snapshot) => snapshot.id === stored.snapshotId) ? stored : null;
    const nextSelection = storedSelection || selectedSnapshot || snapshots.find((snapshot) => snapshot.status === "active") || snapshots[0] || null;
    if (!nextSelection) return;
    setSelectedSnapshotId(nextSelection.id);
    writeSelectedMetadataSnapshot({ snapshotId: nextSelection.id, branchName: nextSelection.branchName });
  }, [selectedSnapshot, snapshots]);

  async function loadSnapshots() {
    setLoading(true);
    setError("");
    try {
      const result = await fetchJson<SnapshotListResponse>(`/api/books/${bookId}/metadata/snapshots`, { cache: "no-store" }, "Load metadata snapshots");
      if (result.unavailable) {
        setSnapshots([]);
        setBranches([]);
        setNote(result.reason || "Metadata timeline tables are not installed.");
        return;
      }
      setSnapshots(result.snapshots || []);
      setBranches(result.branches || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load metadata timeline.");
    } finally {
      setLoading(false);
    }
  }

  async function createBaselineSnapshot() {
    setBusyAction("create");
    setError("");
    setNote("");
    try {
      const result = await fetchJson<SnapshotActionResponse>(
        `/api/books/${bookId}/metadata/snapshots`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: "Book metadata baseline",
            summary: "Baseline snapshot created from the dashboard.",
            sourceType: "manual_edit",
            setAsActive: true,
          }),
        },
        "Create metadata snapshot",
      );
      if (result.snapshot) {
        setSelectedSnapshotId(result.snapshot.id);
        writeSelectedMetadataSnapshot({ snapshotId: result.snapshot.id, branchName: result.snapshot.branchName });
      }
      await loadSnapshots();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create metadata snapshot.");
    } finally {
      setBusyAction(null);
    }
  }

  async function selectSnapshot(snapshot: Snapshot) {
    setSelectedSnapshotId(snapshot.id);
    writeSelectedMetadataSnapshot({ snapshotId: snapshot.id, branchName: snapshot.branchName });
    setNote(`Selected ${snapshot.title} for subsequent runs.`);
  }

  async function activateSnapshot(snapshot: Snapshot) {
    setBusyAction(`activate:${snapshot.id}`);
    setError("");
    setNote("");
    try {
      const result = await fetchJson<SnapshotActionResponse>(
        `/api/books/${bookId}/metadata/snapshots/${snapshot.id}/activate`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ branchName: snapshot.branchName }),
        },
        "Activate metadata snapshot",
      );
      if (result.snapshot) {
        setSelectedSnapshotId(result.snapshot.id);
        writeSelectedMetadataSnapshot({ snapshotId: result.snapshot.id, branchName: result.snapshot.branchName });
      }
      await loadSnapshots();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to activate metadata snapshot.");
    } finally {
      setBusyAction(null);
    }
  }

  async function forkSnapshot(snapshot: Snapshot) {
    setBusyAction(`fork:${snapshot.id}`);
    setError("");
    setNote("");
    try {
      await fetchJson(
        `/api/books/${bookId}/metadata/snapshots/${snapshot.id}/fork`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        },
        "Fork metadata snapshot",
      );
      await loadSnapshots();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to fork metadata snapshot.");
    } finally {
      setBusyAction(null);
    }
  }

  async function archiveSnapshot(snapshot: Snapshot) {
    setBusyAction(`archive:${snapshot.id}`);
    setError("");
    setNote("");
    try {
      await fetchJson(
        `/api/books/${bookId}/metadata/snapshots/${snapshot.id}/archive`,
        { method: "POST" },
        "Archive metadata snapshot",
      );
      await loadSnapshots();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to archive metadata snapshot.");
    } finally {
      setBusyAction(null);
    }
  }

  async function deleteSnapshot(snapshot: Snapshot) {
    setBusyAction(`delete:${snapshot.id}`);
    setError("");
    setNote("");
    try {
      await fetchJson(
        `/api/books/${bookId}/metadata/snapshots/${snapshot.id}`,
        { method: "DELETE" },
        "Delete metadata snapshot",
      );
      await loadSnapshots();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete metadata snapshot.");
    } finally {
      setBusyAction(null);
    }
  }

  const selectOptions = snapshots.map((snapshot) => ({
    value: snapshot.id,
    label: `${snapshot.title} · ${snapshot.branchName} · ${snapshot.status}`,
  }));

  const compareOptions = snapshots
    .filter((snapshot) => snapshot.id !== selectedSnapshotId)
    .map((snapshot) => ({
      value: snapshot.id,
      label: `${snapshot.title} · ${snapshot.branchName} · ${snapshot.status}`,
    }));

  return (
    <Paper withBorder radius="md" p="xl" bg="white" mt="xl">
      <Stack>
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={2}>Metadata Timeline</Title>
            <Text c="dimmed" size="sm">
              Choose the snapshot that future critic and rewrite runs should inherit, compare it against another version, or fork a branch when the plan changes.
            </Text>
          </div>
          <Group gap="xs">
            <Badge color={selectedSnapshot ? (selectedSnapshot.status === "active" ? "green" : "grape") : "gray"} variant="light">
              {selectedSnapshot ? `${selectedSnapshot.branchName} · ${selectedSnapshot.status}` : "No snapshot selected"}
            </Badge>
            <Button color="grape" variant="light" loading={busyAction === "create"} onClick={createBaselineSnapshot}>
              Create Baseline
            </Button>
          </Group>
        </Group>

        {note && <Alert color="blue">{note}</Alert>}
        {error && <Alert color="red">{error}</Alert>}

        {loading && !snapshots.length ? (
          <Text size="sm" c="dimmed">
            Loading metadata snapshots…
          </Text>
        ) : snapshots.length === 0 ? (
          <Alert color="yellow" title="No metadata snapshots yet">
            Create the first baseline snapshot to enable reproducible critic and rewrite runs.
          </Alert>
        ) : (
          <Stack gap="md">
            <Group align="flex-end">
              <Select
                label="Use for next runs"
                value={selectedSnapshotId}
                onChange={(value) => {
                  const snapshot = snapshots.find((item) => item.id === value) || null;
                  if (!snapshot) return;
                  void selectSnapshot(snapshot);
                }}
                data={selectOptions}
                searchable
                clearable={false}
                w={360}
              />
              <Text size="sm" c="dimmed">
                {branches.length} branch{branches.length === 1 ? "" : "es"} tracked
              </Text>
            </Group>

            {selectedSnapshot && (
              <Paper withBorder radius="md" p="md" bg="#fbfaf8">
                <Stack gap={6}>
                  <Group justify="space-between" align="flex-start">
                    <div>
                      <Title order={3}>{selectedSnapshot.title}</Title>
                      <Text size="sm" c="dimmed">
                        {selectedSnapshot.branchName} · {selectedSnapshot.status} · {new Date(selectedSnapshot.updatedAt).toLocaleString()}
                      </Text>
                    </div>
                    <Badge color={selectedSnapshot.status === "active" ? "green" : "gray"} variant="light">
                      {selectedSnapshot.status}
                    </Badge>
                  </Group>
                  <Text size="sm">{selectedSnapshot.summary || "No summary available."}</Text>
                  <Group gap="xs">
                    <Button size="xs" color="teal" onClick={() => void selectSnapshot(selectedSnapshot)}>
                      Use for next runs
                    </Button>
                    <Button size="xs" variant="light" color="grape" loading={busyAction === `activate:${selectedSnapshot.id}`} onClick={() => void activateSnapshot(selectedSnapshot)}>
                      Activate
                    </Button>
                    <Button size="xs" variant="light" color="orange" loading={busyAction === `fork:${selectedSnapshot.id}`} onClick={() => void forkSnapshot(selectedSnapshot)}>
                      Fork
                    </Button>
                    <Button size="xs" variant="light" color="gray" loading={busyAction === `archive:${selectedSnapshot.id}`} onClick={() => void archiveSnapshot(selectedSnapshot)}>
                      Archive
                    </Button>
                    <Button size="xs" variant="light" color="red" loading={busyAction === `delete:${selectedSnapshot.id}`} onClick={() => void deleteSnapshot(selectedSnapshot)}>
                      Delete
                    </Button>
                  </Group>
                </Stack>
              </Paper>
            )}

            <Paper withBorder radius="md" p="md">
              <Table highlightOnHover striped>
                <thead>
                  <tr>
                    <th>Snapshot</th>
                    <th>Branch</th>
                    <th>Status</th>
                    <th>Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((snapshot) => (
                    <tr key={snapshot.id}>
                      <td>
                        <Text fw={700}>{snapshot.title}</Text>
                        <Text size="xs" c="dimmed" lineClamp={2}>
                          {snapshot.summary || "No summary available."}
                        </Text>
                      </td>
                      <td>{snapshot.branchName}</td>
                      <td>
                        <Badge color={snapshot.status === "active" ? "green" : snapshot.status === "draft" ? "blue" : "gray"} variant="light">
                          {snapshot.status}
                        </Badge>
                      </td>
                      <td>{new Date(snapshot.updatedAt).toLocaleString()}</td>
                      <td>
                        <Group gap="xs" wrap="wrap">
                          <Button size="xs" variant={snapshot.id === selectedSnapshotId ? "filled" : "light"} color="teal" onClick={() => void selectSnapshot(snapshot)}>
                            Select
                          </Button>
                          <Button size="xs" variant="light" color="grape" loading={busyAction === `activate:${snapshot.id}`} onClick={() => void activateSnapshot(snapshot)}>
                            Activate
                          </Button>
                          <Button size="xs" variant="light" color="orange" loading={busyAction === `fork:${snapshot.id}`} onClick={() => void forkSnapshot(snapshot)}>
                            Fork
                          </Button>
                          <Button size="xs" variant="light" color="gray" loading={busyAction === `archive:${snapshot.id}`} onClick={() => void archiveSnapshot(snapshot)}>
                            Archive
                          </Button>
                          <Button size="xs" variant="light" color="red" loading={busyAction === `delete:${snapshot.id}`} onClick={() => void deleteSnapshot(snapshot)}>
                            Delete
                          </Button>
                        </Group>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Paper>

            <SimpleGrid cols={{ base: 1, md: 2 }}>
              <Paper withBorder radius="md" p="md" bg="#fbfaf8">
                <Stack gap="xs">
                  <Title order={4}>Governance</Title>
                  <Text size="sm" c="dimmed">
                    Archive is the preferred way to retire a snapshot. Delete is soft and should be used only when a snapshot should be removed from the active timeline.
                  </Text>
                  <Text size="sm" c="dimmed">
                    Selected snapshots stay local to your browser so the next critic or rewrite request can carry the same provenance without extra clicks.
                  </Text>
                </Stack>
              </Paper>

              <Paper withBorder radius="md" p="md" bg="#fbfaf8">
                <Stack gap="sm">
                  <Title order={4}>Compare snapshots</Title>
                  <Text size="sm" c="dimmed">
                    Compare the selected snapshot against another branch or previous revision.
                  </Text>
                  <Select
                    label="Compare against"
                    value={compareSnapshotId}
                    onChange={(value) => setCompareSnapshotId(value)}
                    data={compareOptions}
                    searchable
                    clearable
                    placeholder="Pick a comparison snapshot"
                  />
                  {compareSnapshot && selectedSnapshot ? (
                    <Stack gap="xs">
                      <Group justify="space-between" align="flex-start">
                        <div>
                          <Text fw={700}>{compareSnapshot.title}</Text>
                          <Text size="xs" c="dimmed">
                            {compareSnapshot.branchName} · {compareSnapshot.status}
                          </Text>
                        </div>
                        <Badge color={compareSnapshot.status === "active" ? "green" : "gray"} variant="light">
                          compare target
                        </Badge>
                      </Group>
                      {compareRows.length > 0 ? (
                        <Table striped highlightOnHover withRowBorders={false}>
                          <thead>
                            <tr>
                              <th>Field</th>
                              <th>Selected</th>
                              <th>Compared</th>
                            </tr>
                          </thead>
                          <tbody>
                            {compareRows.map((row) => (
                              <tr key={row.key}>
                                <td>{row.label}</td>
                                <td>
                                  <Text size="sm">{row.left}</Text>
                                </td>
                                <td>
                                  <Text size="sm">{row.right}</Text>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </Table>
                      ) : (
                        <Alert color="green" variant="light">
                          No visible differences found in the compared fields.
                        </Alert>
                      )}
                    </Stack>
                  ) : (
                    <Alert color="blue" variant="light">
                      Select a compare snapshot to inspect differences in summary, branch, and metadata fields.
                    </Alert>
                  )}
                </Stack>
              </Paper>
            </SimpleGrid>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}

function buildSnapshotComparison(left: Snapshot, right: Snapshot) {
  const keys = new Set<string>([
    "title",
    "summary",
    "branchName",
    "status",
    "sourceType",
    "parentSnapshotId",
    ...Object.keys(left.metadataJson || {}),
    ...Object.keys(right.metadataJson || {}),
  ]);

  const rows: Array<{ key: string; label: string; left: string; right: string }> = [];
  for (const key of keys) {
    const leftValue = snapshotFieldValue(left, key);
    const rightValue = snapshotFieldValue(right, key);
    if (leftValue === rightValue) continue;
    rows.push({
      key,
      label: formatFieldLabel(key),
      left: leftValue,
      right: rightValue,
    });
  }
  return rows.slice(0, 20);
}

function snapshotFieldValue(snapshot: Snapshot, key: string) {
  if (key in snapshot) {
    return stringifyValue((snapshot as Record<string, unknown>)[key]);
  }
  return stringifyValue(snapshot.metadataJson?.[key]);
}

function stringifyValue(value: unknown) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatFieldLabel(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^./, (char) => char.toUpperCase());
}
