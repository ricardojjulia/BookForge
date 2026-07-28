import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/books/[bookId]/chat/threads/[threadId]/apply/route";

const { mockCreateClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

describe("POST /api/books/[bookId]/chat/threads/[threadId]/apply", () => {
  it("applies metadata proposal and records tool message", async () => {
    const proposal = {
      id: "proposal-1",
      type: "update_metadata",
      title: "Update metadata",
      rationale: "Align metadata",
      changes: {
        title: "Updated Book",
        genre: "Fiction",
        pointOfView: "Third person",
      },
    };

    const threadSingle = vi.fn(async () => ({ data: { id: "thread-1", book_id: "book-1" }, error: null }));
    const threadEqBook = vi.fn(() => ({ single: threadSingle }));
    const threadEqId = vi.fn(() => ({ eq: threadEqBook }));
    const threadSelect = vi.fn(() => ({ eq: threadEqId }));

    const messageSingle = vi.fn(async () => ({
      data: {
        id: "message-1",
        content_json: { proposals: [proposal] },
      },
      error: null,
    }));
    const messageEqBook = vi.fn(() => ({ single: messageSingle }));
    const messageEqThread = vi.fn(() => ({ eq: messageEqBook }));
    const messageEqId = vi.fn(() => ({ eq: messageEqThread }));
    const messageSelect = vi.fn(() => ({ eq: messageEqId }));

    const previousApplyLimit = vi.fn(async () => ({ data: [], error: null }));
    const previousApplyOrder = vi.fn(() => ({ limit: previousApplyLimit }));
    const previousApplyContains = vi.fn(() => ({ order: previousApplyOrder }));
    const previousApplyEqRole = vi.fn(() => ({ contains: previousApplyContains }));
    const previousApplyEqBook = vi.fn(() => ({ eq: previousApplyEqRole }));
    const previousApplyEqThread = vi.fn(() => ({ eq: previousApplyEqBook }));
    const previousApplySelect = vi.fn(() => ({ eq: previousApplyEqThread }));

    const updateBookEq = vi.fn(async () => ({ error: null }));
    const updateBook = vi.fn(() => ({ eq: updateBookEq }));

    const toolMessageSingle = vi.fn(async () => ({
      data: {
        id: "tool-message-1",
        thread_id: "thread-1",
        role: "tool",
        content: "Applied metadata update proposal.",
        content_json: { action: "apply_proposal" },
        created_at: new Date().toISOString(),
      },
      error: null,
    }));
    const toolMessageSelect = vi.fn(() => ({ single: toolMessageSingle }));
    const toolMessageInsert = vi.fn(() => ({ select: toolMessageSelect }));

    const updateThreadEqBook = vi.fn(async () => ({ error: null }));
    const updateThreadEqId = vi.fn(() => ({ eq: updateThreadEqBook }));
    const updateThread = vi.fn(() => ({ eq: updateThreadEqId }));

    const from = vi.fn((table: string) => {
      if (table === "chat_threads") {
        return {
          select: threadSelect,
          update: updateThread,
        };
      }

      if (table === "chat_messages") {
        return {
          select: (...args: unknown[]) => {
            const columns = String(args[0] || "");
            if (columns === "id,content_json") return messageSelect();
            if (columns === "id,role,content,content_json,created_at") return previousApplySelect();
            throw new Error(`Unexpected chat_messages select: ${columns}`);
          },
          insert: toolMessageInsert,
        };
      }

      if (table === "books") {
        return {
          update: updateBook,
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from,
    });

    const response = await POST(
      new Request("http://localhost/api/books/book-1/chat/threads/thread-1/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messageId: "11111111-1111-4111-8111-111111111111",
          proposalId: "proposal-1",
          applyMode: "update_metadata",
          idempotencyKey: "idem-meta-1",
        }),
      }),
      { params: Promise.resolve({ bookId: "book-1", threadId: "thread-1" }) },
    );

    const payload = await response.json();
    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.applied).toBe(true);
    expect(payload.updatedValues).toMatchObject({
      title: "Updated Book",
      genre: "Fiction",
      point_of_view: "Third person",
    });
    expect(payload.idempotencyKey).toBe("idem-meta-1");
    expect(payload.updatedFields).toEqual(expect.arrayContaining(["title", "genre", "point_of_view"]));
  });

  it("creates revision drafts from proposal and records tool message", async () => {
    const proposal = {
      id: "proposal-2",
      type: "create_revision_draft",
      title: "Draft rewrites",
      rationale: "Tighten clarity.",
      drafts: [
        {
          paragraphId: "22222222-2222-4222-8222-222222222222",
          revisedText: "Rewritten paragraph text.",
          revisionNotes: "Sharper cadence.",
        },
      ],
    };

    const threadSingle = vi.fn(async () => ({ data: { id: "thread-1", book_id: "book-1" }, error: null }));
    const threadEqBook = vi.fn(() => ({ single: threadSingle }));
    const threadEqId = vi.fn(() => ({ eq: threadEqBook }));
    const threadSelect = vi.fn(() => ({ eq: threadEqId }));

    const messageSingle = vi.fn(async () => ({
      data: {
        id: "message-2",
        content_json: { proposals: [proposal] },
      },
      error: null,
    }));
    const messageEqBook = vi.fn(() => ({ single: messageSingle }));
    const messageEqThread = vi.fn(() => ({ eq: messageEqBook }));
    const messageEqId = vi.fn(() => ({ eq: messageEqThread }));
    const messageSelect = vi.fn(() => ({ eq: messageEqId }));

    const previousApplyLimit = vi.fn(async () => ({ data: [], error: null }));
    const previousApplyOrder = vi.fn(() => ({ limit: previousApplyLimit }));
    const previousApplyContains = vi.fn(() => ({ order: previousApplyOrder }));
    const previousApplyEqRole = vi.fn(() => ({ contains: previousApplyContains }));
    const previousApplyEqBook = vi.fn(() => ({ eq: previousApplyEqRole }));
    const previousApplyEqThread = vi.fn(() => ({ eq: previousApplyEqBook }));
    const previousApplySelect = vi.fn(() => ({ eq: previousApplyEqThread }));

    const paragraphMaybeSingle = vi.fn(async () => ({
      data: {
        id: "22222222-2222-4222-8222-222222222222",
        chapter_id: "chapter-1",
        scene_id: "scene-1",
        paragraph_number: 3,
        original_text: "Original paragraph text.",
        is_locked: false,
      },
      error: null,
    }));
    const paragraphEqId = vi.fn(() => ({ maybeSingle: paragraphMaybeSingle }));
    const paragraphEqBook = vi.fn(() => ({ eq: paragraphEqId }));
    const paragraphSelect = vi.fn(() => ({ eq: paragraphEqBook }));

    const revisionJobSingle = vi.fn(async () => ({ data: { id: "job-1" }, error: null }));
    const revisionJobSelect = vi.fn(() => ({ single: revisionJobSingle }));
    const revisionJobInsert = vi.fn(() => ({ select: revisionJobSelect }));

    const versionsSelect = vi.fn(async () => ({ data: [{ id: "version-1" }], error: null }));
    const versionsInsert = vi.fn(() => ({ select: versionsSelect }));

    const toolMessageSingle = vi.fn(async () => ({
      data: {
        id: "tool-message-2",
        thread_id: "thread-1",
        role: "tool",
        content: "Created revision draft proposal.",
        content_json: { action: "apply_proposal" },
        created_at: new Date().toISOString(),
      },
      error: null,
    }));
    const toolMessageSelect = vi.fn(() => ({ single: toolMessageSingle }));
    const toolMessageInsert = vi.fn(() => ({ select: toolMessageSelect }));

    const updateThreadEqBook = vi.fn(async () => ({ error: null }));
    const updateThreadEqId = vi.fn(() => ({ eq: updateThreadEqBook }));
    const updateThread = vi.fn(() => ({ eq: updateThreadEqId }));

    const from = vi.fn((table: string) => {
      if (table === "chat_threads") {
        return {
          select: threadSelect,
          update: updateThread,
        };
      }

      if (table === "chat_messages") {
        return {
          select: (...args: unknown[]) => {
            const columns = String(args[0] || "");
            if (columns === "id,content_json") return messageSelect();
            if (columns === "id,role,content,content_json,created_at") return previousApplySelect();
            throw new Error(`Unexpected chat_messages select: ${columns}`);
          },
          insert: toolMessageInsert,
        };
      }

      if (table === "paragraphs") {
        return {
          select: paragraphSelect,
        };
      }

      if (table === "revision_jobs") {
        return {
          insert: revisionJobInsert,
        };
      }

      if (table === "revision_versions") {
        return {
          insert: versionsInsert,
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from,
    });

    const response = await POST(
      new Request("http://localhost/api/books/book-1/chat/threads/thread-1/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messageId: "11111111-1111-4111-8111-111111111111",
          proposalId: "proposal-2",
          applyMode: "create_revision_draft",
          idempotencyKey: "idem-draft-1",
        }),
      }),
      { params: Promise.resolve({ bookId: "book-1", threadId: "thread-1" }) },
    );

    const payload = await response.json();
    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.applied).toBe(true);
    expect(payload.applyMode).toBe("create_revision_draft");
    expect(payload.revisionJobId).toBe("job-1");
    expect(payload.createdCount).toBe(1);
    expect(payload.idempotencyKey).toBe("idem-draft-1");
    expect(payload.revisionVersionIds).toEqual(["version-1"]);
  });

  it("returns existing apply result for replayed proposal apply", async () => {
    const proposal = {
      id: "proposal-3",
      type: "create_revision_draft",
      title: "Draft rewrites",
      rationale: "Tighten clarity.",
      drafts: [
        {
          paragraphId: "22222222-2222-4222-8222-222222222222",
          revisedText: "Rewritten paragraph text.",
        },
      ],
    };

    const threadSingle = vi.fn(async () => ({ data: { id: "thread-1", book_id: "book-1" }, error: null }));
    const threadEqBook = vi.fn(() => ({ single: threadSingle }));
    const threadEqId = vi.fn(() => ({ eq: threadEqBook }));
    const threadSelect = vi.fn(() => ({ eq: threadEqId }));

    const messageSingle = vi.fn(async () => ({
      data: {
        id: "message-3",
        content_json: { proposals: [proposal] },
      },
      error: null,
    }));
    const messageEqBook = vi.fn(() => ({ single: messageSingle }));
    const messageEqThread = vi.fn(() => ({ eq: messageEqBook }));
    const messageEqId = vi.fn(() => ({ eq: messageEqThread }));
    const messageSelect = vi.fn(() => ({ eq: messageEqId }));

    const previousApplyLimit = vi.fn(async () => ({
      data: [
        {
          id: "tool-message-existing",
          role: "tool",
          content: "Created revision draft proposal.",
          content_json: {
            action: "apply_proposal",
            proposalId: "proposal-3",
            applyMode: "create_revision_draft",
            idempotencyKey: "idem-draft-replay",
            revisionJobId: "job-existing",
            createdCount: 1,
            revisionVersionIds: ["version-existing"],
          },
          created_at: new Date().toISOString(),
        },
      ],
      error: null,
    }));
    const previousApplyOrder = vi.fn(() => ({ limit: previousApplyLimit }));
    const previousApplyContains = vi.fn(() => ({ order: previousApplyOrder }));
    const previousApplyEqRole = vi.fn(() => ({ contains: previousApplyContains }));
    const previousApplyEqBook = vi.fn(() => ({ eq: previousApplyEqRole }));
    const previousApplyEqThread = vi.fn(() => ({ eq: previousApplyEqBook }));
    const previousApplySelect = vi.fn(() => ({ eq: previousApplyEqThread }));

    const revisionJobInsert = vi.fn(() => {
      throw new Error("Should not create a new revision job on replayed apply");
    });

    const from = vi.fn((table: string) => {
      if (table === "chat_threads") {
        return {
          select: threadSelect,
        };
      }

      if (table === "chat_messages") {
        return {
          select: (...args: unknown[]) => {
            const columns = String(args[0] || "");
            if (columns === "id,content_json") return messageSelect();
            if (columns === "id,role,content,content_json,created_at") return previousApplySelect();
            throw new Error(`Unexpected chat_messages select: ${columns}`);
          },
        };
      }

      if (table === "revision_jobs") {
        return {
          insert: revisionJobInsert,
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from,
    });

    const response = await POST(
      new Request("http://localhost/api/books/book-1/chat/threads/thread-1/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messageId: "11111111-1111-4111-8111-111111111111",
          proposalId: "proposal-3",
          applyMode: "create_revision_draft",
          idempotencyKey: "idem-draft-replay",
        }),
      }),
      { params: Promise.resolve({ bookId: "book-1", threadId: "thread-1" }) },
    );

    const payload = await response.json();
    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.applied).toBe(true);
    expect(payload.idempotent).toBe(true);
    expect(payload.idempotencyKey).toBe("idem-draft-replay");
    expect(payload.revisionJobId).toBe("job-existing");
    expect(payload.revisionVersionIds).toEqual(["version-existing"]);
  });

  it("fails revision draft apply when target paragraph is locked", async () => {
    const proposal = {
      id: "proposal-locked",
      type: "create_revision_draft",
      title: "Draft rewrites",
      rationale: "Tighten clarity.",
      drafts: [
        {
          paragraphId: "33333333-3333-4333-8333-333333333333",
          revisedText: "Rewritten paragraph text.",
        },
      ],
    };

    const threadSingle = vi.fn(async () => ({ data: { id: "thread-1", book_id: "book-1" }, error: null }));
    const threadEqBook = vi.fn(() => ({ single: threadSingle }));
    const threadEqId = vi.fn(() => ({ eq: threadEqBook }));
    const threadSelect = vi.fn(() => ({ eq: threadEqId }));

    const messageSingle = vi.fn(async () => ({
      data: {
        id: "message-locked",
        content_json: { proposals: [proposal] },
      },
      error: null,
    }));
    const messageEqBook = vi.fn(() => ({ single: messageSingle }));
    const messageEqThread = vi.fn(() => ({ eq: messageEqBook }));
    const messageEqId = vi.fn(() => ({ eq: messageEqThread }));
    const messageSelect = vi.fn(() => ({ eq: messageEqId }));

    const previousApplyLimit = vi.fn(async () => ({ data: [], error: null }));
    const previousApplyOrder = vi.fn(() => ({ limit: previousApplyLimit }));
    const previousApplyContains = vi.fn(() => ({ order: previousApplyOrder }));
    const previousApplyEqRole = vi.fn(() => ({ contains: previousApplyContains }));
    const previousApplyEqBook = vi.fn(() => ({ eq: previousApplyEqRole }));
    const previousApplyEqThread = vi.fn(() => ({ eq: previousApplyEqBook }));
    const previousApplySelect = vi.fn(() => ({ eq: previousApplyEqThread }));

    const paragraphMaybeSingle = vi.fn(async () => ({
      data: {
        id: "33333333-3333-4333-8333-333333333333",
        chapter_id: "chapter-1",
        scene_id: "scene-1",
        paragraph_number: 9,
        original_text: "Locked paragraph text.",
        is_locked: true,
      },
      error: null,
    }));
    const paragraphEqId = vi.fn(() => ({ maybeSingle: paragraphMaybeSingle }));
    const paragraphEqBook = vi.fn(() => ({ eq: paragraphEqId }));
    const paragraphSelect = vi.fn(() => ({ eq: paragraphEqBook }));

    const revisionJobInsert = vi.fn(() => {
      throw new Error("Should not create a new revision job for locked target");
    });

    const from = vi.fn((table: string) => {
      if (table === "chat_threads") {
        return {
          select: threadSelect,
        };
      }

      if (table === "chat_messages") {
        return {
          select: (...args: unknown[]) => {
            const columns = String(args[0] || "");
            if (columns === "id,content_json") return messageSelect();
            if (columns === "id,role,content,content_json,created_at") return previousApplySelect();
            throw new Error(`Unexpected chat_messages select: ${columns}`);
          },
        };
      }

      if (table === "paragraphs") {
        return {
          select: paragraphSelect,
        };
      }

      if (table === "revision_jobs") {
        return {
          insert: revisionJobInsert,
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from,
    });

    const response = await POST(
      new Request("http://localhost/api/books/book-1/chat/threads/thread-1/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messageId: "11111111-1111-4111-8111-111111111111",
          proposalId: "proposal-locked",
          applyMode: "create_revision_draft",
          idempotencyKey: "idem-locked-1",
        }),
      }),
      { params: Promise.resolve({ bookId: "book-1", threadId: "thread-1" }) },
    );

    const payload = await response.json();
    expect(response.status).toBe(500);
    expect(String(payload.error || "")).toContain("locked");
  });

  it("fails revision draft apply when target paragraph cannot be resolved", async () => {
    const proposal = {
      id: "proposal-unresolved",
      type: "create_revision_draft",
      title: "Draft rewrites",
      rationale: "Tighten clarity.",
      drafts: [
        {
          chapterNumber: 44,
          paragraphNumber: 2,
          revisedText: "Rewritten paragraph text.",
        },
      ],
    };

    const threadSingle = vi.fn(async () => ({ data: { id: "thread-1", book_id: "book-1" }, error: null }));
    const threadEqBook = vi.fn(() => ({ single: threadSingle }));
    const threadEqId = vi.fn(() => ({ eq: threadEqBook }));
    const threadSelect = vi.fn(() => ({ eq: threadEqId }));

    const messageSingle = vi.fn(async () => ({
      data: {
        id: "message-unresolved",
        content_json: { proposals: [proposal] },
      },
      error: null,
    }));
    const messageEqBook = vi.fn(() => ({ single: messageSingle }));
    const messageEqThread = vi.fn(() => ({ eq: messageEqBook }));
    const messageEqId = vi.fn(() => ({ eq: messageEqThread }));
    const messageSelect = vi.fn(() => ({ eq: messageEqId }));

    const previousApplyLimit = vi.fn(async () => ({ data: [], error: null }));
    const previousApplyOrder = vi.fn(() => ({ limit: previousApplyLimit }));
    const previousApplyContains = vi.fn(() => ({ order: previousApplyOrder }));
    const previousApplyEqRole = vi.fn(() => ({ contains: previousApplyContains }));
    const previousApplyEqBook = vi.fn(() => ({ eq: previousApplyEqRole }));
    const previousApplyEqThread = vi.fn(() => ({ eq: previousApplyEqBook }));
    const previousApplySelect = vi.fn(() => ({ eq: previousApplyEqThread }));

    const chapterIn = vi.fn(async () => ({ data: [], error: null }));
    const chapterEqBook = vi.fn(() => ({ in: chapterIn }));
    const chapterSelect = vi.fn(() => ({ eq: chapterEqBook }));

    const revisionJobInsert = vi.fn(() => {
      throw new Error("Should not create a new revision job for unresolved target");
    });

    const from = vi.fn((table: string) => {
      if (table === "chat_threads") {
        return {
          select: threadSelect,
        };
      }

      if (table === "chat_messages") {
        return {
          select: (...args: unknown[]) => {
            const columns = String(args[0] || "");
            if (columns === "id,content_json") return messageSelect();
            if (columns === "id,role,content,content_json,created_at") return previousApplySelect();
            throw new Error(`Unexpected chat_messages select: ${columns}`);
          },
        };
      }

      if (table === "chapters") {
        return {
          select: chapterSelect,
        };
      }

      if (table === "revision_jobs") {
        return {
          insert: revisionJobInsert,
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from,
    });

    const response = await POST(
      new Request("http://localhost/api/books/book-1/chat/threads/thread-1/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messageId: "11111111-1111-4111-8111-111111111111",
          proposalId: "proposal-unresolved",
          applyMode: "create_revision_draft",
          idempotencyKey: "idem-unresolved-1",
        }),
      }),
      { params: Promise.resolve({ bookId: "book-1", threadId: "thread-1" }) },
    );

    const payload = await response.json();
    expect(response.status).toBe(500);
    expect(String(payload.error || "")).toContain("could not be resolved");
  });

  it("fails revision draft apply when chapter exists but paragraph number is missing", async () => {
    const proposal = {
      id: "proposal-missing-paragraph",
      type: "create_revision_draft",
      title: "Draft rewrites",
      rationale: "Tighten clarity.",
      drafts: [
        {
          chapterNumber: 2,
          paragraphNumber: 77,
          revisedText: "Rewritten paragraph text.",
        },
      ],
    };

    const threadSingle = vi.fn(async () => ({ data: { id: "thread-1", book_id: "book-1" }, error: null }));
    const threadEqBook = vi.fn(() => ({ single: threadSingle }));
    const threadEqId = vi.fn(() => ({ eq: threadEqBook }));
    const threadSelect = vi.fn(() => ({ eq: threadEqId }));

    const messageSingle = vi.fn(async () => ({
      data: {
        id: "message-missing-paragraph",
        content_json: { proposals: [proposal] },
      },
      error: null,
    }));
    const messageEqBook = vi.fn(() => ({ single: messageSingle }));
    const messageEqThread = vi.fn(() => ({ eq: messageEqBook }));
    const messageEqId = vi.fn(() => ({ eq: messageEqThread }));
    const messageSelect = vi.fn(() => ({ eq: messageEqId }));

    const previousApplyLimit = vi.fn(async () => ({ data: [], error: null }));
    const previousApplyOrder = vi.fn(() => ({ limit: previousApplyLimit }));
    const previousApplyContains = vi.fn(() => ({ order: previousApplyOrder }));
    const previousApplyEqRole = vi.fn(() => ({ contains: previousApplyContains }));
    const previousApplyEqBook = vi.fn(() => ({ eq: previousApplyEqRole }));
    const previousApplyEqThread = vi.fn(() => ({ eq: previousApplyEqBook }));
    const previousApplySelect = vi.fn(() => ({ eq: previousApplyEqThread }));

    const chapterIn = vi.fn(async () => ({ data: [{ id: "chapter-2", chapter_number: 2 }], error: null }));
    const chapterEqBook = vi.fn(() => ({ in: chapterIn }));
    const chapterSelect = vi.fn(() => ({ eq: chapterEqBook }));

    const paragraphMaybeSingle = vi.fn(async () => ({ data: null, error: null }));
    const paragraphEqNumber = vi.fn(() => ({ maybeSingle: paragraphMaybeSingle }));
    const paragraphEqChapter = vi.fn(() => ({ eq: paragraphEqNumber }));
    const paragraphEqBook = vi.fn(() => ({ eq: paragraphEqChapter }));
    const paragraphSelect = vi.fn(() => ({ eq: paragraphEqBook }));

    const revisionJobInsert = vi.fn(() => {
      throw new Error("Should not create a new revision job for missing paragraph target");
    });

    const from = vi.fn((table: string) => {
      if (table === "chat_threads") {
        return {
          select: threadSelect,
        };
      }

      if (table === "chat_messages") {
        return {
          select: (...args: unknown[]) => {
            const columns = String(args[0] || "");
            if (columns === "id,content_json") return messageSelect();
            if (columns === "id,role,content,content_json,created_at") return previousApplySelect();
            throw new Error(`Unexpected chat_messages select: ${columns}`);
          },
        };
      }

      if (table === "chapters") {
        return {
          select: chapterSelect,
        };
      }

      if (table === "paragraphs") {
        return {
          select: paragraphSelect,
        };
      }

      if (table === "revision_jobs") {
        return {
          insert: revisionJobInsert,
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from,
    });

    const response = await POST(
      new Request("http://localhost/api/books/book-1/chat/threads/thread-1/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messageId: "11111111-1111-4111-8111-111111111111",
          proposalId: "proposal-missing-paragraph",
          applyMode: "create_revision_draft",
          idempotencyKey: "idem-missing-paragraph-1",
        }),
      }),
      { params: Promise.resolve({ bookId: "book-1", threadId: "thread-1" }) },
    );

    const payload = await response.json();
    expect(response.status).toBe(500);
    expect(String(payload.error || "")).toContain("could not be resolved");
  });
});
