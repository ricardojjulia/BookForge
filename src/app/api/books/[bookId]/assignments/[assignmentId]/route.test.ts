import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "@/app/api/books/[bookId]/assignments/[assignmentId]/route";

const { mockCreateClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

describe("book contributor assignment status route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects invalid status payloads", async () => {
    const response = await PATCH(new Request("http://localhost/api/books/book-1/assignments/assignment-1", {
      method: "PATCH",
      body: JSON.stringify({ status: "paused" }),
    }), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Invalid assignment status payload.");
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    const supabase = createAssignmentStatusSupabase({ user: null });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await PATCH(new Request("http://localhost/api/books/book-1/assignments/assignment-1", {
      method: "PATCH",
      body: JSON.stringify({ status: "in_progress" }),
    }), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toMatch(/Authentication required/);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("returns not found for assignments outside the book", async () => {
    const supabase = createAssignmentStatusSupabase({ assignmentFound: false });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await PATCH(new Request("http://localhost/api/books/book-1/assignments/assignment-1", {
      method: "PATCH",
      body: JSON.stringify({ status: "in_progress" }),
    }), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe("Assignment not found.");
    expect(supabase.updatePayload).toBeNull();
  });

  it("denies non-editor users who are not the assignee", async () => {
    const supabase = createAssignmentStatusSupabase({ canEdit: false, assigneeId: "other-user" });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await PATCH(new Request("http://localhost/api/books/book-1/assignments/assignment-1", {
      method: "PATCH",
      body: JSON.stringify({ status: "in_progress" }),
    }), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("Assignment update access denied.");
    expect(supabase.updatePayload).toBeNull();
  });

  it("allows the assignee to update status", async () => {
    const supabase = createAssignmentStatusSupabase({
      canEdit: false,
      assigneeId: "user-1",
      updatedAssignment: { id: "assignment-1", status: "in_progress" },
    });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await PATCH(new Request("http://localhost/api/books/book-1/assignments/assignment-1", {
      method: "PATCH",
      body: JSON.stringify({ status: "in_progress" }),
    }), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.assignment.status).toBe("in_progress");
    expect(supabase.updatePayload).toMatchObject({
      status: "in_progress",
      completed_at: null,
    });
    expect(supabase.assignmentEqCalls).toEqual([
      { column: "id", value: "assignment-1" },
      { column: "book_id", value: "book-1" },
      { column: "id", value: "assignment-1" },
      { column: "book_id", value: "book-1" },
    ]);
  });

  it("allows editors to complete assignments", async () => {
    const supabase = createAssignmentStatusSupabase({
      canEdit: true,
      assigneeId: "other-user",
      updatedAssignment: { id: "assignment-1", status: "completed", completed_at: "2026-08-03T12:00:00.000Z" },
    });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await PATCH(new Request("http://localhost/api/books/book-1/assignments/assignment-1", {
      method: "PATCH",
      body: JSON.stringify({ status: "completed" }),
    }), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.assignment.status).toBe("completed");
    expect(supabase.updatePayload).toMatchObject({ status: "completed" });
    expect(typeof (supabase.updatePayload as { completed_at?: unknown }).completed_at).toBe("string");
  });
});

function routeParams() {
  return { params: Promise.resolve({ bookId: "book-1", assignmentId: "assignment-1" }) };
}

function createAssignmentStatusSupabase(options: {
  user?: { id: string } | null;
  canEdit?: boolean;
  assignmentFound?: boolean;
  assigneeId?: string;
  updatedAssignment?: unknown;
} = {}) {
  const supabase = {
    assignmentEqCalls: [] as Array<{ column: string; value: string }>,
    updatePayload: null as unknown,
    auth: {
      getUser: vi.fn(async () => ({ data: { user: options.user === null ? null : options.user || { id: "user-1" } }, error: null })),
    },
    rpc: vi.fn(async (name: string) => {
      if (name === "can_edit_book") return { data: options.canEdit ?? true, error: null };
      return { data: null, error: new Error(`Unexpected rpc ${name}`) };
    }),
    from: vi.fn((table: string) => {
      if (table !== "creativewriter_contributor_assignments") throw new Error(`Unexpected table ${table}`);
      const assignmentQuery = {
        select: vi.fn(() => assignmentQuery),
        eq: vi.fn((column: string, value: string) => {
          supabase.assignmentEqCalls.push({ column, value });
          return assignmentQuery;
        }),
        maybeSingle: vi.fn(async () => ({
          data: options.assignmentFound === false ? null : { id: "assignment-1", book_id: "book-1", assignee_id: options.assigneeId || "user-1", status: "assigned" },
          error: null,
        })),
        update: vi.fn((payload: unknown) => {
          supabase.updatePayload = payload;
          return assignmentQuery;
        }),
        single: vi.fn(async () => ({ data: options.updatedAssignment || { id: "assignment-1", status: "in_progress" }, error: null })),
      };
      return assignmentQuery;
    }),
  };
  return supabase;
}
