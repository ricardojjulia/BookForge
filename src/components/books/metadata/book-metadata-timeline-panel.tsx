"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Menu, Select, Table, Text } from "@mantine/core";
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

const STATUS_PALETTE: Record<Snapshot["status"], { bg: string; color: string }> = {
  active: { bg: "oklch(0.94 0.05 165)", color: "oklch(0.4 0.1 165)" },
  draft: { bg: "oklch(0.94 0.03 250)", color: "oklch(0.45 0.09 250)" },
  archived: { bg: "oklch(0.96 0.003 90)", color: "oklch(0.5 0.005 90)" },
};

function StatusPill({ status }: { status: Snapshot["status"] }) {
  const palette = STATUS_PALETTE[status];
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.02em",
        padding: "4px 10px",
        borderRadius: 6,
        background: palette.bg,
        color: palette.color,
        width: "fit-content",
        whiteSpace: "nowrap",
      }}
    >
      {status.toUpperCase()}
    </span>
  );
}

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
  const selectedSnapshotIdRef = useRef<string | null>(null);

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

  const selectInitialSnapshot = useCallback((nextSnapshots: Snapshot[]) => {
    if (!nextSnapshots.length) {
      setSelectedSnapshotId(null);
      return;
    }

    const stored = readSelectedMetadataSnapshot();
    const storedSelection =
      stored && nextSnapshots.some((snapshot) => snapshot.id === stored.snapshotId)
        ? nextSnapshots.find((snapshot) => snapshot.id === stored.snapshotId) || null
        : null;

    const currentSelection =
      selectedSnapshotIdRef.current && nextSnapshots.some((snapshot) => snapshot.id === selectedSnapshotIdRef.current)
        ? nextSnapshots.find((snapshot) => snapshot.id === selectedSnapshotIdRef.current) || null
        : null;

    const nextSelection =
      storedSelection ||
      currentSelection ||
      nextSnapshots.find((snapshot) => snapshot.status === "active") ||
      nextSnapshots[0] ||
      null;

    if (!nextSelection) return;
    setSelectedSnapshotId(nextSelection.id);
    writeSelectedMetadataSnapshot({ snapshotId: nextSelection.id, branchName: nextSelection.branchName });
  }, []);

  useEffect(() => {
    selectedSnapshotIdRef.current = selectedSnapshotId;
  }, [selectedSnapshotId]);

  const loadSnapshots = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchJson<SnapshotListResponse>(`/api/books/${bookId}/metadata/snapshots`, { cache: "no-store" }, "Load metadata snapshots");
      if (result.unavailable) {
        setSnapshots([]);
        setBranches([]);
        setSelectedSnapshotId(null);
        setNote(result.reason || "Metadata timeline tables are not installed.");
        return;
      }
      const nextSnapshots = result.snapshots || [];
      setSnapshots(nextSnapshots);
      setBranches(result.branches || []);
      selectInitialSnapshot(nextSnapshots);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load metadata timeline.");
    } finally {
      setLoading(false);
    }
  }, [bookId, selectInitialSnapshot]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadSnapshots();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [loadSnapshots]);

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
    <div style={{ background: "#fff", border: "1px solid oklch(0.92 0.003 90)", borderRadius: 12, padding: "26px 28px", marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "oklch(0.2 0.005 90)" }}>Metadata Timeline</div>
          <p style={{ margin: "6px 0 0", fontSize: 14, color: "oklch(0.5 0.005 90)", maxWidth: 640 }}>
            Choose the snapshot that future critic and rewrite runs should inherit, compare it against another version, or fork a branch when the plan changes.
          </p>
        </div>
        <Button color="grape" loading={busyAction === "create"} onClick={createBaselineSnapshot}>
          Create Baseline
        </Button>
      </div>

      {note && (
        <Alert color="blue" mb="md">
          {note}
        </Alert>
      )}
      {error && (
        <Alert color="red" mb="md">
          {error}
        </Alert>
      )}

      {loading && !snapshots.length ? (
        <Text size="sm" c="dimmed">
          Loading metadata snapshots…
        </Text>
      ) : snapshots.length === 0 ? (
        <Alert color="yellow" title="No metadata snapshots yet">
          Create the first baseline snapshot to enable reproducible critic and rewrite runs.
        </Alert>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: "oklch(0.25 0.005 90)" }}>Use for next runs</label>
            <Select
              value={selectedSnapshotId}
              onChange={(value) => {
                const snapshot = snapshots.find((item) => item.id === value) || null;
                if (!snapshot) return;
                void selectSnapshot(snapshot);
              }}
              data={selectOptions}
              searchable
              clearable={false}
              w={320}
            />
            <span style={{ fontSize: 13, color: "oklch(0.55 0.005 90)" }}>
              {branches.length} branch{branches.length === 1 ? "" : "es"} tracked
            </span>
          </div>

          {selectedSnapshot && (
            <div style={{ background: "#fff", border: "1px solid oklch(0.92 0.003 90)", borderRadius: 12, padding: "22px 24px", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "oklch(0.2 0.005 90)" }}>{selectedSnapshot.title}</div>
                  <div style={{ fontSize: 13, color: "oklch(0.55 0.005 90)", marginTop: 4 }}>
                    {selectedSnapshot.branchName} · {selectedSnapshot.status} · {new Date(selectedSnapshot.updatedAt).toLocaleString()}
                  </div>
                </div>
                <StatusPill status={selectedSnapshot.status} />
              </div>
              <p style={{ margin: "12px 0 16px", fontSize: 13, color: "oklch(0.45 0.005 90)" }}>
                {selectedSnapshot.summary || "No summary available."}
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Button size="sm" color="grape" onClick={() => void selectSnapshot(selectedSnapshot)}>
                  Use for next runs
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  color="dark"
                  loading={busyAction === `activate:${selectedSnapshot.id}`}
                  onClick={() => void activateSnapshot(selectedSnapshot)}
                >
                  Activate
                </Button>
                <Menu shadow="md" width={130} position="bottom-start">
                  <Menu.Target>
                    <Button variant="outline" color="dark" px={0} style={{ width: 34, height: 34, fontSize: 16, fontWeight: 700 }}>
                      ⋯
                    </Button>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item onClick={() => void forkSnapshot(selectedSnapshot)}>Fork</Menu.Item>
                    <Menu.Item onClick={() => void archiveSnapshot(selectedSnapshot)}>Archive</Menu.Item>
                    <Menu.Item color="red" onClick={() => void deleteSnapshot(selectedSnapshot)}>
                      Delete
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </div>
            </div>
          )}

          <div style={{ background: "#fff", border: "1px solid oklch(0.92 0.003 90)", borderRadius: 12, padding: "20px 22px", marginBottom: 20 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 90px 100px 170px 40px",
                gap: 12,
                paddingBottom: 10,
                borderBottom: "1px solid oklch(0.93 0.003 90)",
                fontSize: 12,
                fontWeight: 700,
                color: "oklch(0.5 0.005 90)",
                letterSpacing: "0.02em",
              }}
            >
              <span>SNAPSHOT</span>
              <span>BRANCH</span>
              <span>STATUS</span>
              <span>UPDATED</span>
              <span />
            </div>
            {snapshots.map((snapshot) => (
              <div
                key={snapshot.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 90px 100px 170px 40px",
                  gap: 12,
                  alignItems: "center",
                  padding: "14px 0",
                  borderBottom: "1px solid oklch(0.96 0.003 90)",
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "oklch(0.22 0.005 90)" }}>{snapshot.title}</div>
                  <div style={{ fontSize: 12, color: "oklch(0.55 0.005 90)", marginTop: 2 }}>
                    {snapshot.summary || "No summary available."}
                  </div>
                </div>
                <span style={{ fontSize: 13, color: "oklch(0.45 0.005 90)" }}>{snapshot.branchName}</span>
                <StatusPill status={snapshot.status} />
                <span style={{ fontSize: 13, color: "oklch(0.5 0.005 90)" }}>{new Date(snapshot.updatedAt).toLocaleString()}</span>
                <Menu shadow="md" width={130} position="bottom-end">
                  <Menu.Target>
                    <Button variant="outline" color="dark" px={0} style={{ width: 32, height: 32, fontSize: 15, fontWeight: 700, justifySelf: "end" }}>
                      ⋯
                    </Button>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item onClick={() => void selectSnapshot(snapshot)}>Select</Menu.Item>
                    <Menu.Item onClick={() => void activateSnapshot(snapshot)}>Activate</Menu.Item>
                    <Menu.Item onClick={() => void forkSnapshot(snapshot)}>Fork</Menu.Item>
                    <Menu.Item onClick={() => void archiveSnapshot(snapshot)}>Archive</Menu.Item>
                    <Menu.Item color="red" onClick={() => void deleteSnapshot(snapshot)}>
                      Delete
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ background: "#fff", border: "1px solid oklch(0.92 0.003 90)", borderRadius: 12, padding: "22px 24px" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "oklch(0.2 0.005 90)", marginBottom: 12 }}>Governance</div>
              <p style={{ margin: "0 0 12px", fontSize: 13, color: "oklch(0.5 0.005 90)", lineHeight: 1.6 }}>
                Archive is the preferred way to retire a snapshot. Delete is soft and should be used only when a snapshot should be removed from the active timeline.
              </p>
              <p style={{ margin: 0, fontSize: 13, color: "oklch(0.5 0.005 90)", lineHeight: 1.6 }}>
                Selected snapshots stay local to your browser so the next critic or rewrite request can carry the same provenance without extra clicks.
              </p>
            </div>

            <div style={{ background: "#fff", border: "1px solid oklch(0.92 0.003 90)", borderRadius: 12, padding: "22px 24px" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "oklch(0.2 0.005 90)", marginBottom: 6 }}>Compare snapshots</div>
              <p style={{ margin: "0 0 16px", fontSize: 13, color: "oklch(0.5 0.005 90)" }}>
                Compare the selected snapshot against another branch or previous revision.
              </p>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "oklch(0.25 0.005 90)", marginBottom: 6 }}>
                Compare against
              </label>
              <Select
                value={compareSnapshotId}
                onChange={(value) => setCompareSnapshotId(value)}
                data={compareOptions}
                searchable
                clearable
                placeholder="Pick a comparison snapshot"
                mb={16}
              />
              {compareSnapshot && selectedSnapshot ? (
                <div>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "oklch(0.22 0.005 90)" }}>{compareSnapshot.title}</div>
                      <div style={{ fontSize: 12, color: "oklch(0.55 0.005 90)" }}>
                        {compareSnapshot.branchName} · {compareSnapshot.status}
                      </div>
                    </div>
                    <StatusPill status={compareSnapshot.status} />
                  </div>
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
                </div>
              ) : (
                <div
                  style={{
                    background: "oklch(0.96 0.02 275)",
                    border: "1px solid oklch(0.88 0.05 275)",
                    borderRadius: 10,
                    padding: "14px 16px",
                    fontSize: 13,
                    color: "oklch(0.4 0.1 275)",
                    lineHeight: 1.5,
                  }}
                >
                  Select a compare snapshot to inspect differences in summary, branch, and metadata fields.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
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
