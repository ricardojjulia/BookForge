import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, PATCH } from "@/app/api/books/[bookId]/annotations/[annotationId]/route";

const { mockCreateClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

describe("book annotation mutation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires authentication before resolving comments", async () => {
    const supabase = createAnnotationMutationSupabase({ user: null });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await PATCH(annotationRequest({ resolved: true }), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toMatch(/Authentication required/);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("rejects invalid resolve payloads", async () => {
    const response = await PATCH(annotationRequest({ resolved: "yes" }), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Invalid annotation payload.");
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("lets the comment owner resolve their own reader comment without editor permission", async () => {
    const supabase = createAnnotationMutationSupabase({
      annotation: { id: "comment-1", annotator_id: "user-1" },
      updatedAnnotation: { id: "comment-1", resolved: true },
    });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await PATCH(annotationRequest({ resolved: true }), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.annotation).toEqual({ id: "comment-1", resolved: true });
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(supabase.updatePayload).toEqual({ resolved: true });
    expect(supabase.mutationEqCalls).toEqual([
      { column: "id", value: "comment-1" },
      { column: "book_id", value: "book-1" },
    ]);
  });

  it("lets a book editor reopen someone else's reader comment", async () => {
    const supabase = createAnnotationMutationSupabase({
      user: { id: "editor-1" },
      annotation: { id: "comment-1", annotator_id: "reader-1" },
      canEdit: true,
      updatedAnnotation: { id: "comment-1", resolved: false },
    });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await PATCH(annotationRequest({ resolved: false }), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.annotation).toEqual({ id: "comment-1", resolved: false });
    expect(supabase.rpc).toHaveBeenCalledWith("can_edit_book", { target_book_id: "book-1" });
    expect(supabase.updatePayload).toEqual({ resolved: false });
  });

  it("blocks non-owner non-editor comment updates", async () => {
    const supabase = createAnnotationMutationSupabase({
      user: { id: "viewer-2" },
      annotation: { id: "comment-1", annotator_id: "reader-1" },
      canEdit: false,
    });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await PATCH(annotationRequest({ resolved: true }), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toMatch(/permission/);
    expect(supabase.updatePayload).toBeNull();
  });

  it("returns not found for comments outside the scoped book", async () => {
    const supabase = createAnnotationMutationSupabase({ annotation: null });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await PATCH(annotationRequest({ resolved: true }), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe("Reader comment not found.");
    expect(supabase.lookupEqCalls).toEqual([
      { column: "id", value: "comment-1" },
      { column: "book_id", value: "book-1" },
    ]);
  });

  it("deletes a scoped reader comment when the user owns it", async () => {
    const supabase = createAnnotationMutationSupabase({
      annotation: { id: "comment-1", annotator_id: "user-1" },
    });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await DELETE(new Request("http://localhost/api/books/book-1/annotations/comment-1", { method: "DELETE" }), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(supabase.deleteEqCalls).toEqual([
      { column: "id", value: "comment-1" },
      { column: "book_id", value: "book-1" },
    ]);
  });
});

function annotationRequest(body: unknown) {
  return new Request("http://localhost/api/books/book-1/annotations/comment-1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

function routeParams() {
  return { params: Promise.resolve({ bookId: "book-1", annotationId: "comment-1" }) };
}

function createAnnotationMutationSupabase(options: {
  user?: { id: string } | null;
  annotation?: { id: string; annotator_id: string } | null;
  canEdit?: boolean;
  updatedAnnotation?: unknown;
} = {}) {
  const supabase = {
    lookupEqCalls: [] as Array<{ column: string; value: string }>,
    mutationEqCalls: [] as Array<{ column: string; value: string }>,
    deleteEqCalls: [] as Array<{ column: string; value: string }>,
    updatePayload: null as unknown,
    auth: {
      getUser: vi.fn(async () => ({ data: { user: options.user === null ? null : options.user || { id: "user-1" } }, error: null })),
    },
    rpc: vi.fn(async (name: string) => {
      if (name === "can_edit_book") return { data: options.canEdit ?? false, error: null };
      return { data: null, error: new Error(`Unexpected rpc ${name}`) };
    }),
    from: vi.fn((table: string) => {
      if (table !== "reader_annotations") throw new Error(`Unexpected table ${table}`);
      return {
        select: vi.fn(() => {
          const lookupQuery = {
            eq: vi.fn((column: string, value: string) => {
              supabase.lookupEqCalls.push({ column, value });
              return lookupQuery;
            }),
            maybeSingle: vi.fn(async () => ({ data: options.annotation === undefined ? { id: "comment-1", annotator_id: "user-1" } : options.annotation, error: null })),
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
              single: vi.fn(async () => ({ data: options.updatedAnnotation || { id: "comment-1", resolved: true }, error: null })),
            })),
          };
          return updateQuery;
        }),
        delete: vi.fn(() => {
          const deleteQuery = {
            eq: vi.fn((column: string, value: string) => {
              supabase.deleteEqCalls.push({ column, value });
              return deleteQuery;
            }),
            then: (resolve: (value: { error: null }) => void) => resolve({ error: null }),
          };
          return deleteQuery;
        }),
      };
    }),
  };
  return supabase;
}
