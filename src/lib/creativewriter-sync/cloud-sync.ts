import {
  createCreativeWriterSyncCursor,
  creativeWriterConflictSchema,
  type CreativeWriterCloudChange,
  type CreativeWriterConflict,
  type CreativeWriterConflictResolutionRequest,
  type CreativeWriterConflictResolutionResponse,
  type CreativeWriterLinkedProject,
  type CreativeWriterLocalChange,
  type CreativeWriterSyncPullResponse,
  type CreativeWriterSyncPushResponse,
  detectCreativeWriterConflict,
} from "@/lib/creativewriter-sync";

type QueryResult<T> = Promise<{ data: T | null; error: unknown }>;
type QueryListResult<T> = Promise<{ data: T[] | null; error: unknown }>;

type SelectBuilder<T = unknown> = {
  eq: (column: string, value: unknown) => SelectBuilder<T>;
  order: (column: string, options?: { ascending?: boolean }) => SelectBuilder<T>;
  single?: () => unknown;
  maybeSingle?: () => unknown;
  then?: (resolve: (value: { data?: unknown; error?: unknown }) => unknown) => unknown;
};

type MutationBuilder = {
  eq: (column: string, value: unknown) => MutationBuilder;
  select?: (columns: string) => MutationBuilder;
  single?: () => unknown;
  then?: (resolve: (value: { data?: unknown; error?: unknown }) => unknown) => unknown;
};

type TableBuilder = SelectBuilder & {
  select: (columns: string) => SelectBuilder;
  insert: (payload: unknown) => MutationBuilder;
  update: (payload: unknown) => MutationBuilder;
  upsert: (payload: unknown, options?: { onConflict?: string }) => MutationBuilder;
};

type SupabaseSyncLike = {
  from: (table: string) => unknown;
};

type BookRow = {
  id: string;
  title: string;
  author_name: string | null;
  status: string | null;
  updated_at: string | null;
};

type ChapterRow = {
  id: string;
  chapter_number: number;
  title: string | null;
  summary: string | null;
  current_text: string | null;
  updated_at: string | null;
};

type ParagraphRow = {
  id: string;
  chapter_id: string;
  paragraph_number: number;
  current_text: string | null;
  accepted_text: string | null;
  updated_at: string | null;
};

type SyncProjectRow = {
  id: string;
};

type SyncEventRow = {
  status: "applied" | "conflict" | "rejected";
  cloud_version: number | null;
  conflict_payload: Record<string, unknown> | null;
  rejection_reason: string | null;
};

type ConflictSyncEventRow = {
  id: string;
  entity_type: CreativeWriterLocalChange["entityType"];
  entity_id: string;
  operation: CreativeWriterLocalChange["operation"];
  base_version: number;
  local_version: number;
  conflict_payload: Record<string, unknown> | null;
  resolution_status: CreativeWriterConflict["resolutionStatus"];
};

export async function pullCreativeWriterSync(input: {
  supabase: SupabaseSyncLike;
  userId: string;
  bookId: string;
  localProjectId?: string;
}): Promise<CreativeWriterSyncPullResponse> {
  const snapshot = await fetchSyncSnapshot(input.supabase, input.bookId);
  const cloudVersion = getSnapshotVersion(snapshot);
  const project = buildLinkedProject({
    userId: input.userId,
    bookId: input.bookId,
    localProjectId: input.localProjectId || `cloud-${input.bookId}`,
    cloudVersion,
    linkedAt: snapshot.book.updated_at || new Date(0).toISOString(),
  });
  await upsertSyncProject(input.supabase, project);

  return {
    project,
    syncCursor: project.syncCursor || createCreativeWriterSyncCursor({ bookId: input.bookId, cloudVersion }),
    cloudVersion,
    changes: buildCloudChanges(snapshot),
    conflicts: [],
  };
}

export async function pushCreativeWriterSync(input: {
  supabase: SupabaseSyncLike;
  request: {
    project: CreativeWriterLinkedProject;
    changes: CreativeWriterLocalChange[];
    baseSyncCursor?: string;
  };
}): Promise<CreativeWriterSyncPushResponse> {
  const snapshot = await fetchSyncSnapshot(input.supabase, input.request.project.bookforgeBookId);
  const entitySnapshots = buildEntitySnapshotMap(snapshot);
  const syncProjectId = await upsertSyncProject(input.supabase, input.request.project);
  const appliedChanges: string[] = [];
  const conflicts: CreativeWriterConflict[] = [];
  const rejectedChanges: Array<{ changeId: string; reason: string }> = [];

  for (const change of input.request.changes) {
    const priorEvent = await findPriorSyncEvent(input.supabase, input.request.project, change);
    if (priorEvent) {
      if (priorEvent.status === "applied") appliedChanges.push(change.id);
      if (priorEvent.status === "rejected") rejectedChanges.push({ changeId: change.id, reason: priorEvent.rejection_reason || "Change was previously rejected." });
      if (priorEvent.status === "conflict" && priorEvent.conflict_payload) {
        conflicts.push(creativeWriterConflictSchema.parse(priorEvent.conflict_payload));
      }
      continue;
    }

    const cloudSnapshot = entitySnapshots.get(entityKey(change.entityType, change.entityId));
    const cloudVersion = cloudSnapshot?.version || 0;
    if (detectCreativeWriterConflict({ localBaseVersion: change.baseVersion, cloudVersion, localDirty: true, cloudChanged: cloudVersion > change.baseVersion })) {
      const conflict = buildConflict(input.request.project.localProjectId, change, cloudVersion, cloudSnapshot?.payload);
      await recordSyncEvent(input.supabase, { project: input.request.project, syncProjectId, change, status: "conflict", cloudVersion, conflict });
      conflicts.push(conflict);
      continue;
    }

    const applied = await applySupportedChange(input.supabase, change);
    if (applied.ok) {
      await recordSyncEvent(input.supabase, { project: input.request.project, syncProjectId, change, status: "applied", cloudVersion });
      appliedChanges.push(change.id);
    } else {
      await recordSyncEvent(input.supabase, { project: input.request.project, syncProjectId, change, status: "rejected", cloudVersion, rejectionReason: applied.reason });
      rejectedChanges.push({ changeId: change.id, reason: applied.reason });
    }
  }

  const postSnapshot = await fetchSyncSnapshot(input.supabase, input.request.project.bookforgeBookId);
  const cloudVersion = getSnapshotVersion(postSnapshot);
  const project: CreativeWriterLinkedProject = {
    ...input.request.project,
    syncCursor: createCreativeWriterSyncCursor({ bookId: input.request.project.bookforgeBookId, cloudVersion }),
    lastCloudVersion: cloudVersion,
  };
  await upsertSyncProject(input.supabase, project);

  return {
    project,
    syncCursor: project.syncCursor || createCreativeWriterSyncCursor({ bookId: input.request.project.bookforgeBookId, cloudVersion }),
    cloudVersion,
    appliedChanges,
    conflicts,
    rejectedChanges,
  };
}

export async function resolveCreativeWriterConflict(input: {
  supabase: SupabaseSyncLike;
  userId: string;
  request: CreativeWriterConflictResolutionRequest;
}): Promise<CreativeWriterConflictResolutionResponse> {
  const project = input.request.project;
  if (project.accountId !== input.userId) {
    throw new Error("Linked project account does not match authenticated user.");
  }

  const event = await findConflictSyncEvent(input.supabase, project, input.request.conflictId);
  if (!event) throw new Error("CreativeWriter conflict was not found.");
  if (event.resolution_status !== "unresolved") throw new Error("CreativeWriter conflict is already resolved.");

  const conflict = creativeWriterConflictSchema.parse(event.conflict_payload);
  let resolvedPayload: Record<string, unknown> | null = null;

  if (input.request.resolution === "resolved_local") {
    resolvedPayload = conflict.localPayload;
  } else if (input.request.resolution === "resolved_manual") {
    resolvedPayload = input.request.resolvedPayload || {};
    if (!Object.keys(resolvedPayload).length) throw new Error("Manual conflict resolution requires resolvedPayload.");
  }

  if (resolvedPayload) {
    const applied = await applySupportedChange(input.supabase, {
      id: `resolve-${input.request.conflictId}`,
      projectId: project.localProjectId,
      entityType: event.entity_type,
      entityId: event.entity_id,
      operation: event.operation,
      payload: resolvedPayload,
      baseVersion: event.base_version,
      localVersion: event.local_version,
      idempotencyKey: `resolve-${input.request.conflictId}`,
      createdAt: new Date().toISOString(),
    });
    if (!applied.ok) throw new Error(applied.reason);
  }

  const snapshot = await fetchSyncSnapshot(input.supabase, project.bookforgeBookId);
  const cloudVersion = getSnapshotVersion(snapshot);
  const syncCursor = createCreativeWriterSyncCursor({ bookId: project.bookforgeBookId, cloudVersion });

  const { error } = await resolveMutation(
    table(input.supabase, "creativewriter_sync_events")
      .update({
        resolution_status: input.request.resolution,
        resolved_payload: resolvedPayload,
        resolution_note: input.request.note || null,
        resolved_by: input.userId,
        resolved_at: new Date().toISOString(),
        cloud_version: cloudVersion,
      })
      .eq("id", event.id),
  );
  if (error) throw error;

  await upsertSyncProject(input.supabase, {
    ...project,
    syncCursor,
    lastCloudVersion: cloudVersion,
  });

  return {
    conflictId: input.request.conflictId,
    resolutionStatus: input.request.resolution,
    cloudVersion,
    syncCursor,
  };
}

async function upsertSyncProject(supabase: SupabaseSyncLike, project: CreativeWriterLinkedProject): Promise<string | null> {
  const payload = {
    book_id: project.bookforgeBookId,
    account_id: project.accountId,
    local_project_id: project.localProjectId,
    sync_cursor: project.syncCursor || null,
    last_cloud_version: project.lastCloudVersion || 0,
    linked_at: project.linkedAt,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const builder = table(supabase, "creativewriter_sync_projects")
    .upsert(payload, { onConflict: "book_id,account_id,local_project_id" })
    .select?.("id");

  if (!builder?.single) {
    const { error } = await resolveMutation(table(supabase, "creativewriter_sync_projects").upsert(payload, { onConflict: "book_id,account_id,local_project_id" }));
    if (error) throw error;
    return null;
  }

  const { data, error } = await resolveSingle<SyncProjectRow>(builder as SelectBuilder);
  if (error) throw error;
  return data?.id || null;
}

async function findPriorSyncEvent(supabase: SupabaseSyncLike, project: CreativeWriterLinkedProject, change: CreativeWriterLocalChange): Promise<SyncEventRow | null> {
  const builder = table(supabase, "creativewriter_sync_events")
    .select("status,cloud_version,conflict_payload,rejection_reason")
    .eq("book_id", project.bookforgeBookId)
    .eq("account_id", project.accountId)
    .eq("idempotency_key", change.idempotencyKey);

  const result = await resolveMaybeSingle<SyncEventRow>(builder);
  if (result.error) throw result.error;
  return result.data;
}

async function recordSyncEvent(
  supabase: SupabaseSyncLike,
  input: {
    project: CreativeWriterLinkedProject;
    syncProjectId: string | null;
    change: CreativeWriterLocalChange;
    status: "applied" | "conflict" | "rejected";
    cloudVersion: number;
    conflict?: CreativeWriterConflict;
    rejectionReason?: string;
  },
) {
  const payload = {
    sync_project_id: input.syncProjectId,
    book_id: input.project.bookforgeBookId,
    account_id: input.project.accountId,
    local_change_id: input.change.id,
    idempotency_key: input.change.idempotencyKey,
    conflict_id: input.conflict?.id || null,
    entity_type: input.change.entityType,
    entity_id: input.change.entityId,
    operation: input.change.operation,
    base_version: input.change.baseVersion,
    local_version: input.change.localVersion,
    cloud_version: input.cloudVersion,
    status: input.status,
    payload: input.change.payload,
    conflict_payload: input.conflict || null,
    rejection_reason: input.rejectionReason || null,
  };

  const { error } = await resolveMutation(
    table(supabase, "creativewriter_sync_events").upsert(payload, { onConflict: "book_id,account_id,idempotency_key" }),
  );
  if (error) throw error;
}

async function findConflictSyncEvent(supabase: SupabaseSyncLike, project: CreativeWriterLinkedProject, conflictId: string): Promise<ConflictSyncEventRow | null> {
  const builder = table(supabase, "creativewriter_sync_events")
    .select("id,entity_type,entity_id,operation,base_version,local_version,conflict_payload,resolution_status")
    .eq("book_id", project.bookforgeBookId)
    .eq("account_id", project.accountId)
    .eq("status", "conflict")
    .eq("conflict_id", conflictId);

  const result = await resolveMaybeSingle<ConflictSyncEventRow>(builder);
  if (result.error) throw result.error;
  return result.data;
}

async function fetchSyncSnapshot(supabase: SupabaseSyncLike, bookId: string) {
  const [
    { data: book, error: bookError },
    { data: chapters, error: chaptersError },
    { data: paragraphs, error: paragraphsError },
  ] = await Promise.all([
    resolveSingle<BookRow>(table(supabase, "books").select("id,title,author_name,status,updated_at").eq("id", bookId)),
    resolveList<ChapterRow>(
      table(supabase, "chapters")
        .select("id,chapter_number,title,summary,current_text,updated_at")
        .eq("book_id", bookId)
        .order("chapter_number"),
    ),
    resolveList<ParagraphRow>(
      table(supabase, "paragraphs")
        .select("id,chapter_id,paragraph_number,current_text,accepted_text,updated_at")
        .eq("book_id", bookId)
        .order("paragraph_number"),
    ),
  ]);

  if (bookError) throw bookError;
  if (chaptersError) throw chaptersError;
  if (paragraphsError) throw paragraphsError;
  if (!book) throw new Error("Book not found.");

  return {
    book,
    chapters: chapters || [],
    paragraphs: paragraphs || [],
  };
}

function buildLinkedProject(input: { userId: string; bookId: string; localProjectId: string; cloudVersion: number; linkedAt: string }): CreativeWriterLinkedProject {
  return {
    localProjectId: input.localProjectId,
    accountId: input.userId,
    bookforgeBookId: input.bookId,
    syncCursor: createCreativeWriterSyncCursor({ bookId: input.bookId, cloudVersion: input.cloudVersion }),
    lastCloudVersion: input.cloudVersion,
    linkedAt: input.linkedAt,
  };
}

function buildCloudChanges(snapshot: Awaited<ReturnType<typeof fetchSyncSnapshot>>): CreativeWriterCloudChange[] {
  const bookVersion = versionFromDate(snapshot.book.updated_at);
  return [
    {
      entityType: "book",
      entityId: snapshot.book.id,
      operation: "update",
      cloudVersion: bookVersion,
      updatedAt: snapshot.book.updated_at || new Date(0).toISOString(),
      payload: {
        title: snapshot.book.title,
        authorName: snapshot.book.author_name,
        status: snapshot.book.status,
      },
    },
    ...snapshot.chapters.map((chapter) => ({
      entityType: "chapter" as const,
      entityId: chapter.id,
      operation: "update" as const,
      cloudVersion: versionFromDate(chapter.updated_at),
      updatedAt: chapter.updated_at || new Date(0).toISOString(),
      payload: {
        chapterNumber: chapter.chapter_number,
        title: chapter.title,
        summary: chapter.summary,
        currentText: chapter.current_text,
      },
    })),
    ...snapshot.paragraphs.map((paragraph) => ({
      entityType: "paragraph" as const,
      entityId: paragraph.id,
      operation: "update" as const,
      cloudVersion: versionFromDate(paragraph.updated_at),
      updatedAt: paragraph.updated_at || new Date(0).toISOString(),
      payload: {
        chapterId: paragraph.chapter_id,
        paragraphNumber: paragraph.paragraph_number,
        currentText: paragraph.current_text,
        acceptedText: paragraph.accepted_text,
      },
    })),
  ];
}

function buildEntitySnapshotMap(snapshot: Awaited<ReturnType<typeof fetchSyncSnapshot>>) {
  const snapshots = new Map<string, { version: number; payload: Record<string, unknown> }>();
  snapshots.set(entityKey("book", snapshot.book.id), {
    version: versionFromDate(snapshot.book.updated_at),
    payload: {
      title: snapshot.book.title,
      authorName: snapshot.book.author_name,
      status: snapshot.book.status,
    },
  });
  snapshot.chapters.forEach((chapter) =>
    snapshots.set(entityKey("chapter", chapter.id), {
      version: versionFromDate(chapter.updated_at),
      payload: {
        chapterNumber: chapter.chapter_number,
        title: chapter.title,
        summary: chapter.summary,
        currentText: chapter.current_text,
      },
    }),
  );
  snapshot.paragraphs.forEach((paragraph) =>
    snapshots.set(entityKey("paragraph", paragraph.id), {
      version: versionFromDate(paragraph.updated_at),
      payload: {
        chapterId: paragraph.chapter_id,
        paragraphNumber: paragraph.paragraph_number,
        currentText: paragraph.current_text,
        acceptedText: paragraph.accepted_text,
      },
    }),
  );
  return snapshots;
}

async function applySupportedChange(supabase: SupabaseSyncLike, change: CreativeWriterLocalChange): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (change.operation !== "update" && change.operation !== "metadata_update") {
    return { ok: false, reason: `Operation ${change.operation} is not supported by the current CreativeWriter sync contract.` };
  }

  if (change.entityType === "book") {
    const payload = pickDefined({
      title: stringPayload(change.payload.title),
      author_name: nullableStringPayload(change.payload.authorName),
      status: stringPayload(change.payload.status),
      updated_at: new Date().toISOString(),
    });
    if (!Object.keys(payload).length) return { ok: false, reason: "Book update payload had no supported fields." };
    const { error } = await resolveMutation(table(supabase, "books").update(payload).eq("id", change.entityId));
    if (error) throw error;
    return { ok: true };
  }

  if (change.entityType === "chapter") {
    const payload = pickDefined({
      title: nullableStringPayload(change.payload.title),
      summary: nullableStringPayload(change.payload.summary),
      current_text: stringPayload(change.payload.currentText),
      updated_at: new Date().toISOString(),
    });
    if (!Object.keys(payload).length) return { ok: false, reason: "Chapter update payload had no supported fields." };
    const { error } = await resolveMutation(table(supabase, "chapters").update(payload).eq("id", change.entityId));
    if (error) throw error;
    return { ok: true };
  }

  if (change.entityType === "paragraph") {
    const payload = pickDefined({
      current_text: stringPayload(change.payload.currentText),
      updated_at: new Date().toISOString(),
    });
    if (!Object.keys(payload).length) return { ok: false, reason: "Paragraph update payload had no supported fields." };
    const { error } = await resolveMutation(table(supabase, "paragraphs").update(payload).eq("id", change.entityId));
    if (error) throw error;
    return { ok: true };
  }

  return { ok: false, reason: `Entity type ${change.entityType} is not supported by Phase 3 push.` };
}

function buildConflict(projectId: string, change: CreativeWriterLocalChange, cloudVersion: number, cloudPayload?: Record<string, unknown>): CreativeWriterConflict {
  return creativeWriterConflictSchema.parse({
    id: `conflict-${change.id}`,
    projectId,
    entityType: change.entityType,
    entityId: change.entityId,
    conflictType: change.operation === "reorder" ? "order" : change.entityType === "metadata" ? "metadata" : "content",
    baseVersion: change.baseVersion,
    localPayload: change.payload,
    cloudPayload: { ...(cloudPayload || {}), cloudVersion },
    resolutionStatus: "unresolved",
    createdAt: new Date().toISOString(),
  });
}

function getSnapshotVersion(snapshot: Awaited<ReturnType<typeof fetchSyncSnapshot>>) {
  return Math.max(
    versionFromDate(snapshot.book.updated_at),
    ...snapshot.chapters.map((chapter) => versionFromDate(chapter.updated_at)),
    ...snapshot.paragraphs.map((paragraph) => versionFromDate(paragraph.updated_at)),
  );
}

function versionFromDate(value: string | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? Math.floor(time / 1000) : 0;
}

function entityKey(type: string, id: string) {
  return `${type}:${id}`;
}

function table(supabase: SupabaseSyncLike, name: string): TableBuilder {
  return supabase.from(name) as TableBuilder;
}

async function resolveSingle<T>(builder: SelectBuilder): QueryResult<T> {
  if (typeof builder.single === "function") {
    const result = await (builder.single() as Promise<{ data?: unknown; error?: unknown }>);
    return { data: (result.data as T | null) ?? null, error: result.error };
  }
  const result = await (builder as unknown as Promise<{ data?: T | null; error?: unknown }>);
  return { data: result?.data ?? null, error: result?.error ?? null };
}

async function resolveMaybeSingle<T>(builder: SelectBuilder): QueryResult<T> {
  if (typeof builder.maybeSingle === "function") {
    const result = await (builder.maybeSingle() as Promise<{ data?: unknown; error?: unknown }>);
    return { data: (result.data as T | null) ?? null, error: result.error };
  }
  if (typeof builder.single === "function") {
    const result = await (builder.single() as Promise<{ data?: unknown; error?: unknown }>);
    return { data: (result.data as T | null) ?? null, error: result.error };
  }
  const result = await (builder as unknown as Promise<{ data?: T | null; error?: unknown }>);
  return { data: result?.data ?? null, error: result?.error ?? null };
}

async function resolveList<T>(builder: SelectBuilder): QueryListResult<T> {
  const result = await (builder as unknown as Promise<{ data?: T[] | null; error?: unknown }>);
  return { data: result?.data ?? [], error: result?.error ?? null };
}

async function resolveMutation(builder: MutationBuilder): Promise<{ error: unknown }> {
  const result = await (builder as unknown as Promise<{ error?: unknown }>);
  return { error: result?.error ?? null };
}

function stringPayload(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function nullableStringPayload(value: unknown): string | null | undefined {
  return typeof value === "string" || value === null ? value : undefined;
}

function pickDefined(input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}
