import { describe, expect, it } from "vitest";
import {
  creativeWriterLocalChangeSchema,
  creativeWriterParagraphCreatePayloadSchema,
  creativeWriterParagraphDeletePayloadSchema,
  creativeWriterParagraphReorderPayloadSchema,
  creativeWriterSyncPushRequestSchema,
  detectCreativeWriterConflict,
} from "@/lib/creativewriter-sync";

describe("CreativeWriter sync contracts", () => {
  const linkedProject = {
    localProjectId: "local-1",
    accountId: "account-1",
    bookforgeBookId: "book-1",
    syncCursor: "cursor-1",
    lastCloudVersion: 3,
    linkedAt: "2026-08-02T00:00:00.000Z",
  };

  it("validates a local update change", () => {
    const change = creativeWriterLocalChangeSchema.parse({
      id: "change-1",
      projectId: "local-1",
      entityType: "chapter",
      entityId: "chapter-1",
      operation: "update",
      payload: { title: "Opening" },
      baseVersion: 3,
      localVersion: 4,
      idempotencyKey: "idem-1",
      createdAt: "2026-08-02T00:00:00.000Z",
    });

    expect(change.operation).toBe("update");
  });

  it("rejects unknown change operations", () => {
    expect(() =>
      creativeWriterLocalChangeSchema.parse({
        id: "change-1",
        projectId: "local-1",
        entityType: "chapter",
        entityId: "chapter-1",
        operation: "overwrite",
        payload: {},
        baseVersion: 3,
        localVersion: 4,
        idempotencyKey: "idem-1",
        createdAt: "2026-08-02T00:00:00.000Z",
      }),
    ).toThrow();
  });

  it("validates a sync push request", () => {
    const request = creativeWriterSyncPushRequestSchema.parse({
      project: linkedProject,
      baseSyncCursor: "cursor-1",
      changes: [
        {
          id: "change-1",
          projectId: "local-1",
          entityType: "metadata",
          entityId: "outline",
          operation: "metadata_update",
          payload: { chapters: 2 },
          baseVersion: 3,
          localVersion: 4,
          idempotencyKey: "idem-1",
          createdAt: "2026-08-02T00:00:00.000Z",
        },
      ],
    });

    expect(request.changes).toHaveLength(1);
  });

  it("detects local/cloud write conflicts", () => {
    expect(detectCreativeWriterConflict({ localBaseVersion: 4, cloudVersion: 5, localDirty: true, cloudChanged: true })).toBe(true);
    expect(detectCreativeWriterConflict({ localBaseVersion: 4, cloudVersion: 4, localDirty: true, cloudChanged: false })).toBe(false);
  });

  it("validates paragraph structural payload contracts", () => {
    const createPayload = creativeWriterParagraphCreatePayloadSchema.parse({
      bookId: "book-1",
      chapterId: "chapter-1",
      clientEntityId: "local-paragraph-1",
      paragraphNumber: 3,
      currentText: "New paragraph.",
      baseChapterStructureVersion: 2,
      afterParagraphId: "paragraph-2",
    });

    const deletePayload = creativeWriterParagraphDeletePayloadSchema.parse({
      bookId: "book-1",
      chapterId: "chapter-1",
      lastKnownText: "Removed paragraph.",
      lastKnownParagraphNumber: 2,
      baseChapterStructureVersion: 2,
      deletedAt: "2026-08-02T00:00:00.000Z",
      deleteReason: "Author removed duplicate beat.",
    });

    const reorderPayload = creativeWriterParagraphReorderPayloadSchema.parse({
      bookId: "book-1",
      chapterId: "chapter-1",
      baseOrderedParagraphIds: ["paragraph-1", "paragraph-2", "paragraph-3"],
      orderedParagraphIds: ["paragraph-2", "paragraph-1", "paragraph-3"],
      baseChapterStructureVersion: 2,
    });

    expect(createPayload.clientEntityId).toBe("local-paragraph-1");
    expect(deletePayload.deleteReason).toContain("duplicate");
    expect(reorderPayload.orderedParagraphIds[0]).toBe("paragraph-2");
  });

  it("rejects incomplete paragraph structural payloads", () => {
    expect(() =>
      creativeWriterParagraphCreatePayloadSchema.parse({
        bookId: "book-1",
        chapterId: "chapter-1",
        paragraphNumber: 1,
        currentText: "Missing local identifier.",
        baseChapterStructureVersion: 0,
      }),
    ).toThrow();

    expect(() =>
      creativeWriterParagraphReorderPayloadSchema.parse({
        bookId: "book-1",
        chapterId: "chapter-1",
        baseOrderedParagraphIds: ["paragraph-1"],
        orderedParagraphIds: [],
        baseChapterStructureVersion: 0,
      }),
    ).toThrow();
  });
});
