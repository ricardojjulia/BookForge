import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/books/[bookId]/annotations/route";

const { mockCreateClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

describe("book annotations route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires authentication before listing reader comments", async () => {
    const supabase = createAnnotationsSupabase({ user: null });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await GET(new Request("http://localhost/api/books/book-1/annotations"), {
      params: Promise.resolve({ bookId: "book-1" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toMatch(/Authentication required/);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("requires book visibility before listing reader comments", async () => {
    const supabase = createAnnotationsSupabase({ canView: false });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await GET(new Request("http://localhost/api/books/book-1/annotations"), {
      params: Promise.resolve({ bookId: "book-1" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe("Book not found.");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("lists reader comments only after a visible book check", async () => {
    const annotations = [{ id: "comment-1", paragraph_id: null, note: "Reader note.", resolved: false }];
    const supabase = createAnnotationsSupabase({ annotations });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await GET(new Request("http://localhost/api/books/book-1/annotations"), {
      params: Promise.resolve({ bookId: "book-1" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.annotations).toEqual(annotations);
    expect(supabase.rpc).toHaveBeenCalledWith("can_view_book", { target_book_id: "book-1" });
    expect(supabase.readerEqCalls).toEqual([{ column: "book_id", value: "book-1" }]);
  });

  it("rejects invalid create payloads", async () => {
    const response = await POST(new Request("http://localhost/api/books/book-1/annotations", {
      method: "POST",
      body: JSON.stringify({ note: "" }),
    }), {
      params: Promise.resolve({ bookId: "book-1" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Invalid annotation payload.");
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("creates a reader comment for a visible book and in-book paragraph", async () => {
    const supabase = createAnnotationsSupabase({
      paragraphFound: true,
      insertedAnnotation: { id: "comment-1", paragraph_id: "paragraph-1", note: "Needs tension.", resolved: false },
    });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await POST(new Request("http://localhost/api/books/book-1/annotations", {
      method: "POST",
      body: JSON.stringify({ paragraphId: "00000000-0000-4000-8000-000000000001", note: "Needs tension." }),
    }), {
      params: Promise.resolve({ bookId: "book-1" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.annotation.id).toBe("comment-1");
    expect(supabase.insertPayload).toEqual({
      book_id: "book-1",
      paragraph_id: "00000000-0000-4000-8000-000000000001",
      annotator_id: "user-1",
      note: "Needs tension.",
    });
    expect(supabase.paragraphEqCalls).toEqual([
      { column: "id", value: "00000000-0000-4000-8000-000000000001" },
      { column: "book_id", value: "book-1" },
    ]);
  });

  it("rejects comments for paragraphs outside the book", async () => {
    const supabase = createAnnotationsSupabase({ paragraphFound: false });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await POST(new Request("http://localhost/api/books/book-1/annotations", {
      method: "POST",
      body: JSON.stringify({ paragraphId: "00000000-0000-4000-8000-000000000002", note: "Wrong book." }),
    }), {
      params: Promise.resolve({ bookId: "book-1" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Paragraph not found for this book.");
    expect(supabase.insertPayload).toBeNull();
  });
});

function createAnnotationsSupabase(options: {
  user?: { id: string } | null;
  canView?: boolean;
  annotations?: unknown[];
  paragraphFound?: boolean;
  insertedAnnotation?: unknown;
} = {}) {
  const supabase = {
    readerEqCalls: [] as Array<{ column: string; value: string }>,
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
      if (table === "reader_annotations") {
        const readerQuery = {
          select: vi.fn(() => readerQuery),
          eq: vi.fn((column: string, value: string) => {
            supabase.readerEqCalls.push({ column, value });
            return readerQuery;
          }),
          order: vi.fn(async () => ({ data: options.annotations || [], error: null })),
          insert: vi.fn((payload: unknown) => {
            supabase.insertPayload = payload;
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: options.insertedAnnotation || { id: "comment-1" }, error: null })),
              })),
            };
          }),
        };
        return readerQuery;
      }
      if (table === "paragraphs") {
        const paragraphQuery = {
          select: vi.fn(() => paragraphQuery),
          eq: vi.fn((column: string, value: string) => {
            supabase.paragraphEqCalls.push({ column, value });
            return paragraphQuery;
          }),
          maybeSingle: vi.fn(async () => ({ data: options.paragraphFound ? { id: "paragraph-1" } : null, error: null })),
        };
        return paragraphQuery;
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
  return supabase;
}
