export type MetadataSnapshotSelection = {
  snapshotId: string;
  branchName: string;
};

const STORAGE_KEY = "bookforge.metadataSnapshotSelection";

export function readSelectedMetadataSnapshot() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MetadataSnapshotSelection> | null;
    if (!parsed || typeof parsed.snapshotId !== "string" || typeof parsed.branchName !== "string") return null;
    return {
      snapshotId: parsed.snapshotId,
      branchName: parsed.branchName,
    } satisfies MetadataSnapshotSelection;
  } catch {
    return null;
  }
}

export function writeSelectedMetadataSnapshot(selection: MetadataSnapshotSelection | null) {
  if (typeof window === "undefined") return;
  try {
    if (!selection) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
  } catch {
    // Ignore storage failures; the active snapshot fallback still works.
  }
}

export function mergeMetadataSnapshotBody(body: Record<string, unknown> = {}) {
  const selection = readSelectedMetadataSnapshot();
  if (!selection) return body;
  return {
    ...body,
    metadataSnapshotId: selection.snapshotId,
    metadataBranchName: selection.branchName,
  };
}
