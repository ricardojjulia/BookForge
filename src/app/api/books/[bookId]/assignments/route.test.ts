import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/books/[bookId]/assignments/route";

const { mockCreateClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

const assigneeId = "00000000-0000-4000-8000-000000000010";
const chapterId = "00000000-0000-4000-8000-000000000011";
const paragraphId = "00000000-0000-4000-8000-000000000012";

describe("book contributor assignments route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires authentication before listing assignments", async () => {
    const supabase = createAssignmentsSupabase({ user: null });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await GET(new Request("http://localhost/api/books/book-1/assignments"), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toMatch(/Authentication required/);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("requires book visibility before listing assignments", async () => {
    const supabase = createAssignmentsSupabase({ canView: false });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await GET(new Request("http://localhost/api/books/book-1/assignments"), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe("Book not found.");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("lists assignments only after a visible book check", async () => {
    const assignments = [{ id: "assignment-1", status: "assigned", title: "Review chapter 1" }];
    const supabase = createAssignmentsSupabase({ assignments });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await GET(new Request("http://localhost/api/books/book-1/assignments"), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.assignments).toEqual(assignments);
    expect(supabase.rpc).toHaveBeenCalledWith("can_view_book", { target_book_id: "book-1" });
    expect(supabase.assignmentEqCalls).toEqual([{ column: "book_id", value: "book-1" }]);
  });

  it("rejects invalid assignment create payloads", async () => {
    const response = await POST(new Request("http://localhost/api/books/book-1/assignments", {
      method: "POST",
      body: JSON.stringify({ assigneeId, title: "" }),
    }), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Invalid assignment payload.");
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("requires book edit access before creating assignments", async () => {
    const supabase = createAssignmentsSupabase({ canEdit: false });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await POST(new Request("http://localhost/api/books/book-1/assignments", {
      method: "POST",
      body: JSON.stringify({ assigneeId, title: "Review the chapter." }),
    }), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe("Book not found or edit access denied.");
    expect(supabase.insertPayload).toBeNull();
  });

  it("rejects assignees outside the book roster", async () => {
    const supabase = createAssignmentsSupabase({ assigneeFound: false });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await POST(new Request("http://localhost/api/books/book-1/assignments", {
      method: "POST",
      body: JSON.stringify({ assigneeId, title: "Review the chapter." }),
    }), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Assignee is not a collaborator on this book.");
    expect(supabase.insertPayload).toBeNull();
  });

  it("rejects paragraph-scoped assignments for paragraphs outside the book", async () => {
    const supabase = createAssignmentsSupabase({ paragraphFound: false });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await POST(new Request("http://localhost/api/books/book-1/assignments", {
      method: "POST",
      body: JSON.stringify({ assigneeId, paragraphId, title: "Review this paragraph." }),
    }), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Paragraph not found for this book.");
    expect(supabase.insertPayload).toBeNull();
  });

  it("creates a scoped contributor assignment", async () => {
    const dueAt = "2026-08-10T12:00:00.000Z";
    const supabase = createAssignmentsSupabase({
      chapterFound: true,
      paragraphFound: true,
      insertedAssignment: { id: "assignment-1", status: "assigned", title: "Review chapter 1" },
    });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await POST(new Request("http://localhost/api/books/book-1/assignments", {
      method: "POST",
      body: JSON.stringify({
        assigneeId,
        chapterId,
        paragraphId,
        title: "Review chapter 1",
        note: "Focus on continuity.",
        dueAt,
      }),
    }), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.assignment.id).toBe("assignment-1");
    expect(supabase.insertPayload).toEqual({
      book_id: "book-1",
      chapter_id: chapterId,
      paragraph_id: paragraphId,
      assignee_id: assigneeId,
      assigner_id: "user-1",
      scope: "paragraph",
      status: "assigned",
      title: "Review chapter 1",
      note: "Focus on continuity.",
      due_at: dueAt,
    });
    expect(supabase.chapterEqCalls).toEqual([{ column: "id", value: chapterId }, { column: "book_id", value: "book-1" }]);
    expect(supabase.paragraphEqCalls).toEqual([{ column: "id", value: paragraphId }, { column: "book_id", value: "book-1" }]);
  });
});

function routeParams() {
  return { params: Promise.resolve({ bookId: "book-1" }) };
}

function createAssignmentsSupabase(options: {
  user?: { id: string } | null;
  canView?: boolean;
  canEdit?: boolean;
  assignments?: unknown[];
  assigneeFound?: boolean;
  chapterFound?: boolean;
  paragraphFound?: boolean;
  insertedAssignment?: unknown;
} = {}) {
  const supabase = {
    assignmentEqCalls: [] as Array<{ column: string; value: string }>,
    bookEqCalls: [] as Array<{ column: string; value: string }>,
    collaboratorEqCalls: [] as Array<{ column: string; value: string }>,
    chapterEqCalls: [] as Array<{ column: string; value: string }>,
    paragraphEqCalls: [] as Array<{ column: string; value: string }>,
    insertPayload: null as unknown,
    auth: {
      getUser: vi.fn(async () => ({ data: { user: options.user === null ? null : options.user || { id: "user-1" } }, error: null })),
    },
    rpc: vi.fn(async (name: string) => {
      if (name === "can_view_book") return { data: options.canView ?? true, error: null };
      if (name === "can_edit_book") return { data: options.canEdit ?? true, error: null };
      return { data: null, error: new Error(`Unexpected rpc ${name}`) };
    }),
    from: vi.fn((table: string) => {
      if (table === "creativewriter_contributor_assignments") {
        const assignmentQuery = {
          select: vi.fn(() => assignmentQuery),
          eq: vi.fn((column: string, value: string) => {
            supabase.assignmentEqCalls.push({ column, value });
            return assignmentQuery;
          }),
          order: vi.fn(async () => ({ data: options.assignments || [], error: null })),
          insert: vi.fn((payload: unknown) => {
            supabase.insertPayload = payload;
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: options.insertedAssignment || { id: "assignment-1" }, error: null })),
              })),
            };
          }),
        };
        return assignmentQuery;
      }
      if (table === "books") return scopedLookup(supabase.bookEqCalls, true, { owner_id: "owner-1" });
      if (table === "book_collaborators") return scopedLookup(supabase.collaboratorEqCalls, options.assigneeFound ?? true, { user_id: assigneeId });
      if (table === "chapters") return scopedLookup(supabase.chapterEqCalls, options.chapterFound ?? true, { id: chapterId });
      if (table === "paragraphs") return scopedLookup(supabase.paragraphEqCalls, options.paragraphFound ?? true, { id: paragraphId });
      throw new Error(`Unexpected table ${table}`);
    }),
  };
  return supabase;
}

function scopedLookup(eqCalls: Array<{ column: string; value: string }>, found: boolean, row: unknown) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: string) => {
      eqCalls.push({ column, value });
      return query;
    }),
    maybeSingle: vi.fn(async () => ({ data: found ? row : null, error: null })),
  };
  return query;
}
