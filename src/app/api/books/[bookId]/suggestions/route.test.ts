import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/books/[bookId]/suggestions/route";

const { mockCreateClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

const chapterId = "00000000-0000-4000-8000-000000000001";
const paragraphId = "00000000-0000-4000-8000-000000000002";

describe("book contributor suggestions route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires authentication before listing suggestions", async () => {
    const supabase = createSuggestionsSupabase({ user: null });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await GET(new Request("http://localhost/api/books/book-1/suggestions"), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toMatch(/Authentication required/);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("requires book visibility before listing suggestions", async () => {
    const supabase = createSuggestionsSupabase({ canView: false });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await GET(new Request("http://localhost/api/books/book-1/suggestions"), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe("Book not found.");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("lists suggestions only after a visible book check", async () => {
    const suggestions = [{ id: "suggestion-1", status: "proposed", suggested_text: "Sharper line." }];
    const supabase = createSuggestionsSupabase({ suggestions });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await GET(new Request("http://localhost/api/books/book-1/suggestions"), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.suggestions).toEqual(suggestions);
    expect(supabase.rpc).toHaveBeenCalledWith("can_view_book", { target_book_id: "book-1" });
    expect(supabase.suggestionEqCalls).toEqual([{ column: "book_id", value: "book-1" }]);
  });

  it("rejects invalid suggestion create payloads", async () => {
    const response = await POST(new Request("http://localhost/api/books/book-1/suggestions", {
      method: "POST",
      body: JSON.stringify({ suggestedText: "" }),
    }), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Invalid suggestion payload.");
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("creates a scoped contributor suggestion", async () => {
    const supabase = createSuggestionsSupabase({
      chapterFound: true,
      paragraphFound: true,
      insertedSuggestion: { id: "suggestion-1", status: "proposed", suggested_text: "Sharper line." },
    });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await POST(new Request("http://localhost/api/books/book-1/suggestions", {
      method: "POST",
      body: JSON.stringify({
        chapterId,
        paragraphId,
        originalTextSnapshot: "Original line.",
        suggestedText: "Sharper line.",
        rationale: "Tighter rhythm.",
      }),
    }), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.suggestion.id).toBe("suggestion-1");
    expect(supabase.insertPayload).toEqual({
      book_id: "book-1",
      chapter_id: chapterId,
      paragraph_id: paragraphId,
      proposer_id: "user-1",
      status: "proposed",
      original_text_snapshot: "Original line.",
      suggested_text: "Sharper line.",
      rationale: "Tighter rhythm.",
    });
    expect(supabase.chapterEqCalls).toEqual([{ column: "id", value: chapterId }, { column: "book_id", value: "book-1" }]);
    expect(supabase.paragraphEqCalls).toEqual([{ column: "id", value: paragraphId }, { column: "book_id", value: "book-1" }]);
  });

  it("rejects paragraph-scoped suggestions for paragraphs outside the book", async () => {
    const supabase = createSuggestionsSupabase({ paragraphFound: false });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await POST(new Request("http://localhost/api/books/book-1/suggestions", {
      method: "POST",
      body: JSON.stringify({ paragraphId, suggestedText: "Wrong book." }),
    }), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Paragraph not found for this book.");
    expect(supabase.insertPayload).toBeNull();
  });
});

function routeParams() {
  return { params: Promise.resolve({ bookId: "book-1" }) };
}

function createSuggestionsSupabase(options: {
  user?: { id: string } | null;
  canView?: boolean;
  suggestions?: unknown[];
  chapterFound?: boolean;
  paragraphFound?: boolean;
  insertedSuggestion?: unknown;
} = {}) {
  const supabase = {
    suggestionEqCalls: [] as Array<{ column: string; value: string }>,
    chapterEqCalls: [] as Array<{ column: string; value: string }>,
    paragraphEqCalls: [] as Array<{ column: string; value: string }>,
    insertPayload: null as unknown,
    auth: {
      getUser: vi.fn(async () => ({ data: { user: options.user === null ? null : options.user || { id: "user-1" } }, error: null })),
    },
    rpc: vi.fn(async (name: string) => {
      if (name === "can_view_book") return { data: options.canView ?? true, error: null };
      return { data: null, error: new Error(`Unexpected rpc ${name}`) };
    }),
    from: vi.fn((table: string) => {
      if (table === "creativewriter_contributor_suggestions") {
        const suggestionQuery = {
          select: vi.fn(() => suggestionQuery),
          eq: vi.fn((column: string, value: string) => {
            supabase.suggestionEqCalls.push({ column, value });
            return suggestionQuery;
          }),
          order: vi.fn(async () => ({ data: options.suggestions || [], error: null })),
          insert: vi.fn((payload: unknown) => {
            supabase.insertPayload = payload;
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: options.insertedSuggestion || { id: "suggestion-1" }, error: null })),
              })),
            };
          }),
        };
        return suggestionQuery;
      }
      if (table === "chapters") return scopedLookup(supabase.chapterEqCalls, options.chapterFound ?? true);
      if (table === "paragraphs") return scopedLookup(supabase.paragraphEqCalls, options.paragraphFound ?? true);
      throw new Error(`Unexpected table ${table}`);
    }),
  };
  return supabase;
}

function scopedLookup(eqCalls: Array<{ column: string; value: string }>, found: boolean) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: string) => {
      eqCalls.push({ column, value });
      return query;
    }),
    maybeSingle: vi.fn(async () => ({ data: found ? { id: "scoped-row" } : null, error: null })),
  };
  return query;
}
