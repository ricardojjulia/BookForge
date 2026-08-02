import { describe, expect, it, vi } from "vitest";
import { pullCreativeWriterSync, pushCreativeWriterSync, resolveCreativeWriterConflict } from "@/lib/creativewriter-sync/cloud-sync";
import type { CreativeWriterSyncPushRequest } from "@/lib/creativewriter-sync";

const baseTime = "2026-08-02T12:00:00.000Z";

describe("CreativeWriter cloud sync service", () => {
  it("pulls book, chapter, and paragraph changes with a sync cursor", async () => {
    const supabase = createSyncSupabase();

    const result = await pullCreativeWriterSync({
      supabase,
      userId: "user-1",
      bookId: "book-1",
      localProjectId: "local-1",
    });

    expect(result.project.bookforgeBookId).toBe("book-1");
    expect(result.syncCursor).toMatch(/^book:book-1:version:/);
    expect(result.changes.map((change) => change.entityType)).toEqual(["book", "chapter", "paragraph"]);
  });

  it("applies a paragraph update when the base version is current", async () => {
    const supabase = createSyncSupabase();
    const request = pushRequest({
      baseVersion: version(baseTime),
      payload: { currentText: "Updated paragraph." },
    });

    const result = await pushCreativeWriterSync({ supabase, request });

    expect(result.appliedChanges).toEqual(["change-1"]);
    expect(result.conflicts).toEqual([]);
    expect(supabase.updates.paragraphs[0]).toMatchObject({
      id: "paragraph-1",
      payload: { current_text: "Updated paragraph." },
    });
    expect(supabase.ledgerEvents[0]).toMatchObject({
      local_change_id: "change-1",
      idempotency_key: "idem-1",
      status: "applied",
    });
  });

  it("returns a conflict when cloud changed after the local base version", async () => {
    const supabase = createSyncSupabase();
    const request = pushRequest({
      baseVersion: version("2026-08-02T10:00:00.000Z"),
      payload: { currentText: "Local stale paragraph." },
    });

    const result = await pushCreativeWriterSync({ supabase, request });

    expect(result.appliedChanges).toEqual([]);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].entityId).toBe("paragraph-1");
    expect(result.conflicts[0].cloudPayload).toMatchObject({ currentText: "Paragraph text.", cloudVersion: version(baseTime) });
    expect(supabase.updates.paragraphs).toEqual([]);
    expect(supabase.ledgerEvents[0]).toMatchObject({
      local_change_id: "change-1",
      idempotency_key: "idem-1",
      status: "conflict",
    });
  });

  it("does not reapply an idempotent change already recorded in the sync ledger", async () => {
    const supabase = createSyncSupabase({
      priorEvents: [
        {
          status: "applied",
          cloud_version: version(baseTime),
          conflict_payload: null,
          rejection_reason: null,
        },
      ],
    });
    const request = pushRequest({
      baseVersion: version(baseTime),
      payload: { currentText: "Updated paragraph." },
    });

    const result = await pushCreativeWriterSync({ supabase, request });

    expect(result.appliedChanges).toEqual(["change-1"]);
    expect(supabase.updates.paragraphs).toEqual([]);
    expect(supabase.ledgerEvents).toEqual([]);
  });

  it("rejects structural create, delete, and reorder operations before manuscript structure editing is enabled", async () => {
    const supabase = createSyncSupabase();
    const request = pushRequest({
      baseVersion: version(baseTime),
      payload: { currentText: "Unsupported structural edit." },
      changes: [
        {
          id: "create-chapter",
          operation: "create",
          entityType: "chapter",
          entityId: "local-chapter-new",
          idempotencyKey: "idem-create-chapter",
        },
        {
          id: "delete-paragraph",
          operation: "delete",
          entityType: "paragraph",
          entityId: "paragraph-1",
          idempotencyKey: "idem-delete-paragraph",
        },
        {
          id: "reorder-paragraph",
          operation: "reorder",
          entityType: "paragraph",
          entityId: "paragraph-1",
          idempotencyKey: "idem-reorder-paragraph",
        },
      ],
    });

    const result = await pushCreativeWriterSync({ supabase, request });

    expect(result.appliedChanges).toEqual([]);
    expect(result.conflicts).toEqual([]);
    expect(result.rejectedChanges).toEqual([
      {
        changeId: "create-chapter",
        reason: "Operation create is not supported by the current CreativeWriter sync contract.",
      },
      {
        changeId: "delete-paragraph",
        reason: "Operation delete is not supported by the current CreativeWriter sync contract.",
      },
      {
        changeId: "reorder-paragraph",
        reason: "Operation reorder is not supported by the current CreativeWriter sync contract.",
      },
    ]);
    expect(supabase.updates.chapters).toEqual([]);
    expect(supabase.updates.paragraphs).toEqual([]);
    expect(supabase.ledgerEvents.map((event) => event.status)).toEqual(["rejected", "rejected", "rejected"]);
  });

  it("resolves a conflict with a manual paragraph payload and marks the ledger event", async () => {
    const supabase = createSyncSupabase({ conflictEvent: unresolvedConflictEvent() });

    const result = await resolveCreativeWriterConflict({
      supabase,
      userId: "user-1",
      request: {
        project: pushRequest({ baseVersion: version(baseTime), payload: {} }).project,
        conflictId: "conflict-change-1",
        resolution: "resolved_manual",
        resolvedPayload: { currentText: "Manually merged paragraph." },
        note: "Merged local and cloud language.",
      },
    });

    expect(result.resolutionStatus).toBe("resolved_manual");
    expect(supabase.updates.paragraphs[0]).toMatchObject({
      id: "paragraph-1",
      payload: { current_text: "Manually merged paragraph." },
    });
    expect(supabase.ledgerEventUpdates[0]).toMatchObject({
      id: "event-1",
      payload: {
        resolution_status: "resolved_manual",
        resolved_payload: { currentText: "Manually merged paragraph." },
        resolution_note: "Merged local and cloud language.",
        resolved_by: "user-1",
      },
    });
  });

  it("resolves a conflict by keeping cloud text without mutating the manuscript", async () => {
    const supabase = createSyncSupabase({ conflictEvent: unresolvedConflictEvent() });

    const result = await resolveCreativeWriterConflict({
      supabase,
      userId: "user-1",
      request: {
        project: pushRequest({ baseVersion: version(baseTime), payload: {} }).project,
        conflictId: "conflict-change-1",
        resolution: "resolved_cloud",
      },
    });

    expect(result.resolutionStatus).toBe("resolved_cloud");
    expect(supabase.updates.paragraphs).toEqual([]);
    expect(supabase.ledgerEventUpdates[0]).toMatchObject({
      id: "event-1",
      payload: {
        resolution_status: "resolved_cloud",
        resolved_payload: null,
      },
    });
  });
});

function pushRequest(input: {
  baseVersion: number;
  payload: Record<string, unknown>;
  changes?: Array<{
    id: string;
    operation: CreativeWriterSyncPushRequest["changes"][number]["operation"];
    entityType: CreativeWriterSyncPushRequest["changes"][number]["entityType"];
    entityId: string;
    idempotencyKey: string;
  }>;
}): CreativeWriterSyncPushRequest {
  return {
    project: {
      localProjectId: "local-1",
      accountId: "user-1",
      bookforgeBookId: "book-1",
      linkedAt: baseTime,
      lastCloudVersion: version(baseTime),
      syncCursor: `book:book-1:version:${version(baseTime)}`,
    },
    changes: (input.changes || [
      {
        id: "change-1",
        operation: "update",
        entityType: "paragraph",
        entityId: "paragraph-1",
        idempotencyKey: "idem-1",
      },
    ]).map((change, index) => ({
      id: change.id,
      projectId: "local-1",
      entityType: change.entityType,
      entityId: change.entityId,
      operation: change.operation,
      payload: input.payload,
      baseVersion: input.baseVersion,
      localVersion: input.baseVersion + index + 1,
      idempotencyKey: change.idempotencyKey,
      createdAt: baseTime,
    })),
  };
}

function createSyncSupabase(options: { priorEvents?: Array<{ status: "applied" | "conflict" | "rejected"; cloud_version: number; conflict_payload: Record<string, unknown> | null; rejection_reason: string | null }>; conflictEvent?: Record<string, unknown> } = {}) {
  const updates = {
    books: [] as Array<{ id: unknown; payload: unknown }>,
    chapters: [] as Array<{ id: unknown; payload: unknown }>,
    paragraphs: [] as Array<{ id: unknown; payload: Record<string, unknown> }>,
  };
  const ledgerProjects: unknown[] = [];
  const ledgerEvents: Record<string, unknown>[] = [];
  const ledgerEventUpdates: Array<{ id: unknown; payload: unknown }> = [];

  return {
    updates,
    ledgerProjects,
    ledgerEvents,
    ledgerEventUpdates,
    from: vi.fn((table: string) => {
      let eqColumn = "";
      let eqValue: unknown = "";
      const eqValues = new Map<string, unknown>();
      const builder = {
        select() {
          return builder;
        },
        eq(column: string, value: unknown) {
          eqColumn = column;
          eqValue = value;
          eqValues.set(column, value);
          return builder;
        },
        order() {
          return builder;
        },
        upsert(payload: unknown) {
          const mutation = {
            select() {
              return mutation;
            },
            single() {
              if (table === "creativewriter_sync_projects") {
                ledgerProjects.push(payload);
                return Promise.resolve({ data: { id: "sync-project-1" }, error: null });
              }
              return Promise.resolve({ data: null, error: null });
            },
            then(resolve: (value: { error: null }) => unknown) {
              if (table === "creativewriter_sync_projects") ledgerProjects.push(payload);
              if (table === "creativewriter_sync_events") ledgerEvents.push(payload as Record<string, unknown>);
              return resolve({ error: null });
            },
          };
          return mutation;
        },
        update(payload: unknown) {
          const mutation = {
            eq(column: string, value: unknown) {
              if (table === "books") updates.books.push({ id: value, payload });
              if (table === "chapters") updates.chapters.push({ id: value, payload });
              if (table === "paragraphs") updates.paragraphs.push({ id: value, payload: payload as Record<string, unknown> });
              if (table === "creativewriter_sync_events") ledgerEventUpdates.push({ id: value, payload });
              return mutation;
            },
            then(resolve: (value: { error: null }) => unknown) {
              return resolve({ error: null });
            },
          };
          return mutation;
        },
        async single() {
          if (table === "books") {
            return {
              data: { id: eqValue, title: "The Forge", author_name: "Author", status: "draft", updated_at: baseTime },
              error: null,
            };
          }
          return { data: null, error: null };
        },
        async maybeSingle() {
          if (table === "creativewriter_sync_events") {
            if (eqValues.get("conflict_id")) {
              return {
                data: options.conflictEvent || null,
                error: null,
              };
            }
            return {
              data: options.priorEvents?.find(() => eqValues.get("idempotency_key") === "idem-1") || null,
              error: null,
            };
          }
          return { data: null, error: null };
        },
        then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
          if (table === "chapters") {
            return resolve({
              data: [{ id: "chapter-1", chapter_number: 1, title: "Opening", summary: null, current_text: "Chapter text.", updated_at: baseTime }],
              error: null,
            });
          }
          if (table === "paragraphs") {
            return resolve({
              data: [{ id: "paragraph-1", chapter_id: "chapter-1", paragraph_number: 1, current_text: "Paragraph text.", accepted_text: null, updated_at: baseTime }],
              error: null,
            });
          }
          return resolve({ data: [], error: null });
        },
      };
      void eqColumn;
      return builder;
    }),
  };
}

function unresolvedConflictEvent() {
  return {
    id: "event-1",
    entity_type: "paragraph",
    entity_id: "paragraph-1",
    operation: "update",
    base_version: version("2026-08-02T10:00:00.000Z"),
    local_version: version("2026-08-02T10:00:00.000Z") + 1,
    resolution_status: "unresolved",
    conflict_payload: {
      id: "conflict-change-1",
      projectId: "local-1",
      entityType: "paragraph",
      entityId: "paragraph-1",
      conflictType: "content",
      baseVersion: version("2026-08-02T10:00:00.000Z"),
      localPayload: { currentText: "Local stale paragraph." },
      cloudPayload: { currentText: "Cloud paragraph." },
      resolutionStatus: "unresolved",
      createdAt: baseTime,
    },
  };
}

function version(value: string) {
  return Math.floor(new Date(value).getTime() / 1000);
}
