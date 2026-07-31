import type { SupabaseClient } from "@supabase/supabase-js";

export type MetadataSourceType = "initial_plan" | "critic_update" | "manual_edit" | "system_merge";

export type MetadataSnapshotRecord = {
  id: string;
  book_id: string;
  branch_name: string;
  parent_snapshot_id: string | null;
  status: "draft" | "active" | "archived";
  title: string;
  summary: string | null;
  metadata_json: Record<string, unknown>;
  source_type: MetadataSourceType;
  source_ref_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type MetadataBranchRecord = {
  id: string;
  book_id: string;
  name: string;
  head_snapshot_id: string | null;
  is_default: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type MetadataDecisionRecord = {
  id: string;
  book_id: string;
  snapshot_id: string;
  decision_type: "accept" | "reject" | "postpone" | "custom";
  subject_type: "recommendation" | "task" | "objective" | "constraint";
  subject_ref: string;
  rationale: string | null;
  created_by: string | null;
  created_at: string;
};

export type ResolvedMetadataSnapshotContext = {
  snapshot: MetadataSnapshotRecord;
  branchName: string;
  sourceType: MetadataResolutionSource;
};

export type MetadataResolutionSource = "explicit_snapshot" | "branch_active" | "active_snapshot";

export type BookMetadataSource = {
  id: string;
  title: string | null;
  author_name: string | null;
  genre: string | null;
  target_audience: string | null;
  point_of_view: string | null;
  tense: string | null;
  status: string | null;
};

export function snapshotSelectColumns() {
  return "id,book_id,branch_name,parent_snapshot_id,status,title,summary,metadata_json,source_type,source_ref_id,created_by,created_at,updated_at,archived_at";
}

export function branchSelectColumns() {
  return "id,book_id,name,head_snapshot_id,is_default,created_by,created_at,updated_at";
}

export function decisionSelectColumns() {
  return "id,book_id,snapshot_id,decision_type,subject_type,subject_ref,rationale,created_by,created_at";
}

export async function loadAccessibleBook<T extends BookMetadataSource>(supabase: SupabaseClient, bookId: string) {
  const { data: book, error } = await supabase
    .from("books")
    .select("id,title,author_name,genre,target_audience,point_of_view,tense,status")
    .eq("id", bookId)
    .maybeSingle<T>();

  if (error) throw error;
  return book || null;
}

export async function resolveMetadataSnapshotContext(
  supabase: SupabaseClient,
  bookId: string,
  options?: {
    metadataSnapshotId?: string | null;
    metadataBranchName?: string | null;
  },
): Promise<ResolvedMetadataSnapshotContext> {
  const explicitSnapshotId = stringOrNull(options?.metadataSnapshotId);
  if (explicitSnapshotId) {
    const { data: snapshot, error } = await supabase
      .from("book_metadata_snapshots")
      .select(snapshotSelectColumns())
      .eq("book_id", bookId)
      .eq("id", explicitSnapshotId)
      .maybeSingle();
    if (error) throw error;
    if (snapshot) {
      const snapshotRecord = snapshot as unknown as MetadataSnapshotRecord;
      return { snapshot: snapshotRecord, branchName: snapshotRecord.branch_name, sourceType: "explicit_snapshot" };
    }
  }

  const explicitBranchName = stringOrNull(options?.metadataBranchName);
  const { data: defaultBranch, error: defaultBranchError } = await supabase
    .from("book_metadata_branches")
    .select(branchSelectColumns())
    .eq("book_id", bookId)
    .eq("is_default", true)
    .maybeSingle();
  if (defaultBranchError) throw defaultBranchError;

  const defaultBranchRecord = defaultBranch as unknown as MetadataBranchRecord | null;

  const branchName = explicitBranchName || defaultBranchRecord?.name || "main";

  const { data: activeByBranch, error: activeByBranchError } = await supabase
    .from("book_metadata_snapshots")
    .select(snapshotSelectColumns())
    .eq("book_id", bookId)
    .eq("branch_name", branchName)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1);
  if (activeByBranchError) throw activeByBranchError;

  const branchSnapshot = (activeByBranch || [])[0] as unknown as MetadataSnapshotRecord | undefined;
  if (branchSnapshot) return { snapshot: branchSnapshot, branchName, sourceType: "branch_active" };

  const { data: activeAny, error: activeAnyError } = await supabase
    .from("book_metadata_snapshots")
    .select(snapshotSelectColumns())
    .eq("book_id", bookId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1);
  if (activeAnyError) throw activeAnyError;

  const fallbackSnapshot = (activeAny || [])[0] as unknown as MetadataSnapshotRecord | undefined;
  if (fallbackSnapshot) return { snapshot: fallbackSnapshot, branchName: fallbackSnapshot.branch_name, sourceType: "active_snapshot" };

  // Self-heal empty metadata timelines by seeding a default active snapshot from current book state.
  const book = await loadAccessibleBook(supabase, bookId);
  if (!book) throw new Error("Book not found.");

  const {
    data: {
      user,
    },
  } = await supabase.auth.getUser();

  const now = new Date().toISOString();
  const seedBranchName = branchName || "main";

  const { error: deactivateError } = await supabase
    .from("book_metadata_snapshots")
    .update({ status: "draft", updated_at: now })
    .eq("book_id", bookId)
    .eq("branch_name", seedBranchName)
    .eq("status", "active");
  if (deactivateError) throw deactivateError;

  const { data: seededSnapshot, error: seedSnapshotError } = await supabase
    .from("book_metadata_snapshots")
    .insert({
      book_id: bookId,
      branch_name: seedBranchName,
      parent_snapshot_id: null,
      status: "active",
      title: `${book.title || "Untitled book"} baseline`,
      summary: "Initial metadata baseline seeded from current book state.",
      metadata_json: buildMetadataJson(book, { branchName: seedBranchName, sourceType: "initial_plan" }),
      source_type: "initial_plan",
      source_ref_id: null,
      created_by: user?.id || null,
      created_at: now,
      updated_at: now,
    })
    .select(snapshotSelectColumns())
    .maybeSingle();
  if (seedSnapshotError) throw seedSnapshotError;

  const seededSnapshotRecord = seededSnapshot as unknown as MetadataSnapshotRecord | null;
  let activeSeedRecord = seededSnapshotRecord;

  if (!activeSeedRecord) {
    const { data: refreshedActiveRows, error: refreshedActiveError } = await supabase
      .from("book_metadata_snapshots")
      .select(snapshotSelectColumns())
      .eq("book_id", bookId)
      .eq("branch_name", seedBranchName)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1);
    if (refreshedActiveError) throw refreshedActiveError;
    activeSeedRecord = ((refreshedActiveRows || [])[0] as unknown as MetadataSnapshotRecord | undefined) || null;
  }

  if (!activeSeedRecord) {
    throw new Error("Unable to create or resolve an active metadata snapshot.");
  }

  const { error: branchUpsertError } = await supabase.from("book_metadata_branches").upsert(
    {
      book_id: bookId,
      name: seedBranchName,
      head_snapshot_id: activeSeedRecord.id,
      is_default: seedBranchName === "main",
      created_by: user?.id || null,
      updated_at: now,
    },
    { onConflict: "book_id,name" },
  );
  if (branchUpsertError) throw branchUpsertError;

  return { snapshot: activeSeedRecord, branchName: seedBranchName, sourceType: "active_snapshot" };
}

export function buildMetadataJson(
  book: BookMetadataSource,
  overrides?: {
    title?: string;
    summary?: string;
    metadataJson?: Record<string, unknown>;
    sourceType?: MetadataSourceType;
    branchName?: string;
  },
) {
  const metadataJson = overrides?.metadataJson && typeof overrides.metadataJson === "object" ? overrides.metadataJson : {};

  return {
    purpose: "Seed snapshot for keeping critic and rewrite work aligned.",
    objectives: [
      "Preserve the current book direction.",
      "Make critic and rewrite runs reproducible.",
      "Keep decisions tied to a named plan snapshot.",
    ],
    book: {
      title: book.title,
      authorName: book.author_name,
      genre: book.genre,
      targetAudience: book.target_audience,
      pointOfView: book.point_of_view,
      tense: book.tense,
      status: book.status,
    },
    branch: overrides?.branchName || "main",
    sourceType: overrides?.sourceType || "initial_plan",
    title: overrides?.title || `${book.title || "Untitled book"} baseline`,
    summary: overrides?.summary || "Initial metadata baseline seeded from current book state.",
    context: metadataJson,
  };
}

export function makeBranchName(bookTitle: string | null, suffix: string) {
  const base = slugify(bookTitle || "book");
  return `${base}-${suffix}`.replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function isMissingMetadataSchema(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: string; message?: string };
  if (record.code === "42P01" || record.code === "PGRST205") return true;
  const message = String(record.message || "").toLowerCase();
  return message.includes("book_metadata") && (message.includes("does not exist") || message.includes("schema cache"));
}

export function toSnapshotResponse(row: MetadataSnapshotRecord) {
  return {
    id: row.id,
    bookId: row.book_id,
    branchName: row.branch_name,
    parentSnapshotId: row.parent_snapshot_id,
    status: row.status,
    title: row.title,
    summary: row.summary,
    metadataJson: row.metadata_json,
    sourceType: row.source_type,
    sourceRefId: row.source_ref_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

export function toBranchResponse(row: MetadataBranchRecord) {
  return {
    id: row.id,
    bookId: row.book_id,
    name: row.name,
    headSnapshotId: row.head_snapshot_id,
    isDefault: row.is_default,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toDecisionResponse(row: MetadataDecisionRecord) {
  return {
    id: row.id,
    bookId: row.book_id,
    snapshotId: row.snapshot_id,
    decisionType: row.decision_type,
    subjectType: row.subject_type,
    subjectRef: row.subject_ref,
    rationale: row.rationale,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
