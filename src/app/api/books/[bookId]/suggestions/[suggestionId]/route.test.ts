import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "@/app/api/books/[bookId]/suggestions/[suggestionId]/route";

const { mockCreateClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

describe("book contributor suggestion status route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires authentication before changing suggestion status", async () => {
    const supabase = createSuggestionStatusSupabase({ user: null });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await PATCH(suggestionRequest({ status: "accepted" }), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toMatch(/Authentication required/);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("rejects invalid status payloads", async () => {
    const response = await PATCH(suggestionRequest({ status: "proposed" }), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Invalid suggestion payload.");
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("lets the proposer withdraw their proposed suggestion", async () => {
    const supabase = createSuggestionStatusSupabase({
      suggestion: { id: "suggestion-1", proposer_id: "user-1", status: "proposed" },
      updatedSuggestion: { id: "suggestion-1", status: "withdrawn" },
    });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await PATCH(suggestionRequest({ status: "withdrawn", reviewNote: "Changed my mind." }), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.suggestion).toEqual({ id: "suggestion-1", status: "withdrawn" });
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(supabase.updatePayload).toMatchObject({
      status: "withdrawn",
      reviewer_id: null,
      review_note: "Changed my mind.",
      reviewed_at: null,
      applied_at: null,
    });
    expect(typeof (supabase.updatePayload as { updated_at?: unknown }).updated_at).toBe("string");
    expect(typeof (supabase.updatePayload as { withdrawn_at?: unknown }).withdrawn_at).toBe("string");
    expect(supabase.mutationEqCalls).toEqual([{ column: "id", value: "suggestion-1" }, { column: "book_id", value: "book-1" }]);
  });

  it("lets a book editor accept someone else's proposed suggestion", async () => {
    const supabase = createSuggestionStatusSupabase({
      user: { id: "editor-1" },
      suggestion: { id: "suggestion-1", proposer_id: "reader-1", status: "proposed" },
      canEdit: true,
      updatedSuggestion: { id: "suggestion-1", status: "accepted" },
    });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await PATCH(suggestionRequest({ status: "accepted", reviewNote: "Use this." }), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.suggestion).toEqual({ id: "suggestion-1", status: "accepted" });
    expect(supabase.rpc).toHaveBeenCalledWith("can_edit_book", { target_book_id: "book-1" });
    expect(supabase.updatePayload).toMatchObject({
      status: "accepted",
      reviewer_id: "editor-1",
      review_note: "Use this.",
      applied_at: null,
      withdrawn_at: null,
    });
    expect(typeof (supabase.updatePayload as { reviewed_at?: unknown }).reviewed_at).toBe("string");
  });

  it("blocks non-editor review actions even when the user proposed the suggestion", async () => {
    const supabase = createSuggestionStatusSupabase({
      suggestion: { id: "suggestion-1", proposer_id: "user-1", status: "proposed" },
      canEdit: false,
    });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await PATCH(suggestionRequest({ status: "accepted" }), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toMatch(/review/);
    expect(supabase.updatePayload).toBeNull();
  });

  it("blocks status changes once a suggestion is no longer proposed", async () => {
    const supabase = createSuggestionStatusSupabase({
      suggestion: { id: "suggestion-1", proposer_id: "reader-1", status: "accepted" },
      canEdit: true,
    });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await PATCH(suggestionRequest({ status: "rejected" }), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toBe("Only proposed suggestions can change status.");
    expect(supabase.updatePayload).toBeNull();
  });

  it("requires a suggestion to be accepted before applying it to the manuscript", async () => {
    const supabase = createSuggestionStatusSupabase({
      user: { id: "editor-1" },
      suggestion: { id: "suggestion-1", proposer_id: "reader-1", status: "proposed" },
      canEdit: true,
    });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await PATCH(suggestionRequest({ status: "applied" }), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toBe("Suggestion must be accepted before it can be applied.");
    expect(supabase.appliedRpcPayload).toBeNull();
    expect(supabase.updatePayload).toBeNull();
  });

  it("applies an accepted suggestion through the atomic apply RPC", async () => {
    const supabase = createSuggestionStatusSupabase({
      user: { id: "editor-1" },
      suggestion: { id: "suggestion-1", proposer_id: "reader-1", status: "accepted" },
      canEdit: true,
      appliedSuggestion: {
        id: "suggestion-1",
        status: "applied",
        reviewer_id: "editor-1",
        review_note: "Applied cleanly.",
        suggestion_updated_at: "2026-08-02T12:30:00.000Z",
        reviewed_at: "2026-08-02T12:20:00.000Z",
        applied_at: "2026-08-02T12:30:00.000Z",
        withdrawn_at: null,
        paragraph_id: "paragraph-1",
        current_text: "Applied suggestion text.",
        accepted_text: "Applied suggestion text.",
        paragraph_updated_at: "2026-08-02T12:30:00.000Z",
      },
    });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await PATCH(suggestionRequest({ status: "applied", reviewNote: "Applied cleanly." }), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      suggestion: {
        id: "suggestion-1",
        status: "applied",
        reviewer_id: "editor-1",
        review_note: "Applied cleanly.",
        updated_at: "2026-08-02T12:30:00.000Z",
        reviewed_at: "2026-08-02T12:20:00.000Z",
        applied_at: "2026-08-02T12:30:00.000Z",
        withdrawn_at: null,
      },
      paragraph: {
        id: "paragraph-1",
        currentText: "Applied suggestion text.",
        acceptedText: "Applied suggestion text.",
        updatedAt: "2026-08-02T12:30:00.000Z",
      },
    });
    expect(supabase.rpc).toHaveBeenCalledWith("can_edit_book", { target_book_id: "book-1" });
    expect(supabase.appliedRpcPayload).toEqual({
      target_book_id: "book-1",
      target_suggestion_id: "suggestion-1",
      target_reviewer_id: "editor-1",
      target_review_note: "Applied cleanly.",
    });
    expect(supabase.updatePayload).toBeNull();
  });

  it("returns a stale-text conflict when the apply RPC detects a changed paragraph", async () => {
    const supabase = createSuggestionStatusSupabase({
      user: { id: "editor-1" },
      suggestion: { id: "suggestion-1", proposer_id: "reader-1", status: "accepted" },
      canEdit: true,
      applyError: { message: "Suggestion cannot be applied because the paragraph changed after it was proposed." },
    });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await PATCH(suggestionRequest({ status: "applied" }), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toBe("Suggestion cannot be applied because the paragraph changed after it was proposed.");
    expect(supabase.appliedRpcPayload).toMatchObject({ target_suggestion_id: "suggestion-1" });
  });

  it("returns not found for suggestions outside the scoped book", async () => {
    const supabase = createSuggestionStatusSupabase({ suggestion: null });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await PATCH(suggestionRequest({ status: "accepted" }), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe("Contributor suggestion not found.");
    expect(supabase.lookupEqCalls).toEqual([{ column: "id", value: "suggestion-1" }, { column: "book_id", value: "book-1" }]);
  });
});

function suggestionRequest(body: unknown) {
  return new Request("http://localhost/api/books/book-1/suggestions/suggestion-1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

function routeParams() {
  return { params: Promise.resolve({ bookId: "book-1", suggestionId: "suggestion-1" }) };
}

function createSuggestionStatusSupabase(options: {
  user?: { id: string } | null;
  suggestion?: { id: string; proposer_id: string; status: string } | null;
  canEdit?: boolean;
  updatedSuggestion?: unknown;
  appliedSuggestion?: unknown;
  applyError?: unknown;
} = {}) {
  const supabase = {
    lookupEqCalls: [] as Array<{ column: string; value: string }>,
    mutationEqCalls: [] as Array<{ column: string; value: string }>,
    updatePayload: null as unknown,
    appliedRpcPayload: null as unknown,
    auth: {
      getUser: vi.fn(async () => ({ data: { user: options.user === null ? null : options.user || { id: "user-1" } }, error: null })),
    },
    rpc: vi.fn((name: string, payload?: unknown) => {
      if (name === "can_edit_book") return Promise.resolve({ data: options.canEdit ?? false, error: null });
      if (name === "apply_creativewriter_contributor_suggestion") {
        supabase.appliedRpcPayload = payload;
        return {
          single: vi.fn(async () => ({
            data: options.appliedSuggestion || null,
            error: options.applyError || null,
          })),
        };
      }
      return { data: null, error: new Error(`Unexpected rpc ${name}`) };
    }),
    from: vi.fn((table: string) => {
      if (table !== "creativewriter_contributor_suggestions") throw new Error(`Unexpected table ${table}`);
      return {
        select: vi.fn(() => {
          const lookupQuery = {
            eq: vi.fn((column: string, value: string) => {
              supabase.lookupEqCalls.push({ column, value });
              return lookupQuery;
            }),
            maybeSingle: vi.fn(async () => ({
              data: options.suggestion === undefined ? { id: "suggestion-1", proposer_id: "user-1", status: "proposed" } : options.suggestion,
              error: null,
            })),
          };
          return lookupQuery;
        }),
        update: vi.fn((payload: unknown) => {
          supabase.updatePayload = payload;
          const updateQuery = {
            eq: vi.fn((column: string, value: string) => {
              supabase.mutationEqCalls.push({ column, value });
              return updateQuery;
            }),
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: options.updatedSuggestion || { id: "suggestion-1", status: "accepted" }, error: null })),
            })),
          };
          return updateQuery;
        }),
      };
    }),
  };
  return supabase;
}
