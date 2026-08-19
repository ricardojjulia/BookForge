import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/books/[bookId]/chat/threads/[threadId]/messages/route";

const { mockCreateClient, mockCreateManagedChatCompletion, mockSelectAndPrepareActiveModel, mockGetUserLmStudioSettings } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockCreateManagedChatCompletion: vi.fn(),
  mockSelectAndPrepareActiveModel: vi.fn(),
  mockGetUserLmStudioSettings: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

vi.mock("@/lib/lmstudio/client", () => ({
  createManagedChatCompletion: mockCreateManagedChatCompletion,
}));

vi.mock("@/lib/lmstudio/orchestrator", () => ({
  selectAndPrepareActiveModel: mockSelectAndPrepareActiveModel,
}));

vi.mock("@/lib/lmstudio/settings", () => ({
  getUserLmStudioSettings: mockGetUserLmStudioSettings,
}));

vi.mock("@/lib/lmstudio/model-selection", () => ({
  getReasoningModelCandidates: vi.fn(() => []),
}));

describe("POST /api/books/[bookId]/chat/threads/[threadId]/messages", () => {
  it("returns create_revision_draft proposal in edit mode when model emits revisionDrafts JSON", async () => {
    const threadSingle = vi.fn(async () => ({ data: { id: "thread-1", book_id: "book-1", title: "Book Copilot", mode: "edit" }, error: null }));
    const threadEqBook = vi.fn(() => ({ single: threadSingle }));
    const threadEqId = vi.fn(() => ({ eq: threadEqBook }));
    const threadSelect = vi.fn(() => ({ eq: threadEqId }));

    const userMessageInsertSingle = vi.fn(async () => ({
      data: { id: "msg-user-1", role: "user", content: "Please rewrite paragraph 2", created_at: new Date().toISOString() },
      error: null,
    }));
    const userMessageInsertSelect = vi.fn(() => ({ single: userMessageInsertSingle }));

    const assistantMessageInsertSingle = vi.fn(async () => ({
      data: {
        id: "msg-assistant-1",
        role: "assistant",
        content: "I drafted safe proposals for your review.",
        content_json: {
          proposals: [
            {
              id: "proposal-generated",
              type: "create_revision_draft",
              title: "Create revision draft(s)",
              rationale: "Improve line flow.",
              drafts: [
                {
                  paragraphId: "22222222-2222-4222-8222-222222222222",
                  revisedText: "A cleaner revised paragraph.",
                  revisionNotes: "Reduce repetition.",
                },
              ],
            },
          ],
        },
        created_at: new Date().toISOString(),
      },
      error: null,
    }));
    const assistantMessageInsertSelect = vi.fn(() => ({ single: assistantMessageInsertSingle }));

    let chatMessagesInsertCount = 0;
    const chatMessagesInsert = vi.fn<(payload: Record<string, unknown>) => { select: typeof userMessageInsertSelect }>(() => {
      chatMessagesInsertCount += 1;
      if (chatMessagesInsertCount === 1) return { select: userMessageInsertSelect };
      return { select: assistantMessageInsertSelect };
    });

    const recentMessagesLimit = vi.fn(async () => ({ data: [], error: null }));
    const recentMessagesOrder = vi.fn(() => ({ limit: recentMessagesLimit }));
    const recentMessagesEqThread = vi.fn(() => ({ order: recentMessagesOrder }));
    const recentMessagesSelect = vi.fn(() => ({ eq: recentMessagesEqThread }));

    const booksSingle = vi.fn(async () => ({
      data: {
        id: "book-1",
        title: "My Book",
        genre: "Fiction",
        target_audience: "Adults",
        point_of_view: "Third person",
        tense: "Past",
        status: "draft",
      },
      error: null,
    }));
    const booksEq = vi.fn(() => ({ single: booksSingle }));
    const booksSelect = vi.fn(() => ({ eq: booksEq }));

    const bibleMaybeSingle = vi.fn(async () => ({ data: null, error: null }));
    const bibleEq = vi.fn(() => ({ maybeSingle: bibleMaybeSingle }));
    const bibleSelect = vi.fn(() => ({ eq: bibleEq }));

    const chaptersLimit = vi.fn(async () => ({ data: [], error: null }));
    const chaptersOrder = vi.fn(() => ({ limit: chaptersLimit }));
    const chaptersEq = vi.fn(() => ({ order: chaptersOrder }));
    const chaptersSelect = vi.fn(() => ({ eq: chaptersEq }));

    const reportsLimit = vi.fn(async () => ({ data: [], error: null }));
    const reportsOrder = vi.fn(() => ({ limit: reportsLimit }));
    const reportsEq = vi.fn(() => ({ order: reportsOrder }));
    const reportsSelect = vi.fn(() => ({ eq: reportsEq }));

    const paragraphsLimit = vi.fn(async () => ({ data: [], error: null }));
    const paragraphsOrderParagraph = vi.fn(() => ({ limit: paragraphsLimit }));
    const paragraphsOrderChapter = vi.fn(() => ({ order: paragraphsOrderParagraph }));
    const paragraphsEq = vi.fn(() => ({ order: paragraphsOrderChapter }));
    const paragraphsSelect = vi.fn(() => ({ eq: paragraphsEq }));

    const revisionVersionsLimit = vi.fn(async () => ({ data: [], error: null }));
    const revisionVersionsOrder = vi.fn(() => ({ limit: revisionVersionsLimit }));
    const revisionVersionsEqRejected = vi.fn(() => ({ order: revisionVersionsOrder }));
    const revisionVersionsNot = vi.fn(() => ({ eq: revisionVersionsEqRejected }));
    const revisionVersionsEqBook = vi.fn(() => ({ not: revisionVersionsNot }));
    const revisionVersionsSelect = vi.fn(() => ({ eq: revisionVersionsEqBook }));

    const snapshotInsert = vi.fn(async () => ({ error: null }));
    const threadUpdateEqBook = vi.fn(async () => ({ error: null }));
    const threadUpdateEqId = vi.fn(() => ({ eq: threadUpdateEqBook }));
    const threadUpdate = vi.fn(() => ({ eq: threadUpdateEqId }));

    const from = vi.fn((table: string) => {
      if (table === "chat_threads") {
        return {
          select: threadSelect,
          update: threadUpdate,
        };
      }

      if (table === "chat_messages") {
        return {
          insert: chatMessagesInsert,
          select: (...args: unknown[]) => {
            const columns = String(args[0] || "");
            if (columns === "role,content") return recentMessagesSelect();
            throw new Error(`Unexpected chat_messages select: ${columns}`);
          },
        };
      }

      if (table === "books") {
        return {
          select: booksSelect,
        };
      }

      if (table === "book_bibles") {
        return {
          select: bibleSelect,
        };
      }

      if (table === "chapters") {
        return {
          select: chaptersSelect,
        };
      }

      if (table === "coherence_reports") {
        return {
          select: reportsSelect,
        };
      }

      if (table === "paragraphs") {
        return {
          select: paragraphsSelect,
        };
      }

      if (table === "revision_versions") {
        return {
          select: revisionVersionsSelect,
        };
      }

      if (table === "chat_context_snapshots") {
        return {
          insert: snapshotInsert,
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

    mockGetUserLmStudioSettings.mockResolvedValue({
      temperature: 0.4,
      topP: 1,
      maxOutputTokens: 2200,
      contextWindowTokens: 64000,
    });

    mockSelectAndPrepareActiveModel.mockResolvedValue({
      client: {},
      preparedModel: "model-1",
      model: "model-1",
      modelSelection: {
        source: "manual",
        selectionReason: "test",
        selectedScore: 1,
      },
    });

    mockCreateManagedChatCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              summary: "I drafted safe proposals for your review.",
              rationale: "Improve line flow.",
              revisionDrafts: [
                {
                  paragraphId: "22222222-2222-4222-8222-222222222222",
                  revisedText: "A cleaner revised paragraph.",
                  revisionNotes: "Reduce repetition.",
                },
              ],
            }),
          },
        },
      ],
      usage: {
        prompt_tokens: 200,
        completion_tokens: 120,
        total_tokens: 320,
      },
    });

    const response = await POST(
      new Request("http://localhost/api/books/book-1/chat/threads/thread-1/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userMessage: "Please rewrite paragraph 2 for clarity",
          mode: "edit",
        }),
      }),
      { params: Promise.resolve({ bookId: "book-1", threadId: "thread-1" }) },
    );

    const payload = await response.json();
    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.assistantMessage?.content).toContain("safe proposals");

    const assistantInsertPayload = (chatMessagesInsert.mock.calls[1]?.[0] || {}) as {
      content_json?: { proposals?: Array<Record<string, unknown>> };
    };
    const insertedProposals = assistantInsertPayload.content_json?.proposals || [];
    expect(insertedProposals.length).toBeGreaterThan(0);
    expect(insertedProposals[0]?.type).toBe("create_revision_draft");
    const insertedDrafts = (insertedProposals[0]?.drafts || []) as Array<Record<string, unknown>>;
    expect(insertedDrafts[0]?.paragraphId).toBe("22222222-2222-4222-8222-222222222222");
    expect(insertedDrafts[0]?.revisedText).toBe("A cleaner revised paragraph.");

    const proposals = (payload.assistantMessage?.content_json?.proposals || []) as Array<Record<string, unknown>>;
    expect(proposals.length).toBeGreaterThan(0);
    expect(proposals[0]?.type).toBe("create_revision_draft");

    const drafts = (proposals[0]?.drafts || []) as Array<Record<string, unknown>>;
    expect(drafts[0]?.paragraphId).toBe("22222222-2222-4222-8222-222222222222");
    expect(drafts[0]?.revisedText).toBe("A cleaner revised paragraph.");
  });
});
