import { describe, expect, it, vi } from "vitest";
import { PATCH } from "@/app/api/books/[bookId]/rewrite-workflow/review/route";

const { mockCreateClient, canManageBookWorkflowMock, addNotificationMock } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  canManageBookWorkflowMock: vi.fn(async () => true),
  addNotificationMock: vi.fn(async () => undefined),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

vi.mock("@/lib/collaboration/workflow", () => ({
  canManageBookWorkflow: canManageBookWorkflowMock,
  addCollaborationNotificationWithEmail: addNotificationMock,
  normalizeReviewNote: (note?: string) => (typeof note === "string" && note.trim() ? note.trim() : null),
}));

describe("PATCH /api/books/[bookId]/rewrite-workflow/review", () => {
  it("returns 403 when user cannot manage rewrite approval workflow", async () => {
    canManageBookWorkflowMock.mockResolvedValueOnce(false);
    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "actor-1" } } })),
      },
      from: vi.fn(() => ({
        select: vi.fn(),
        eq: vi.fn(),
        maybeSingle: vi.fn(),
      })),
    });

    const response = await PATCH(
      new Request("http://localhost/api/books/book-1/rewrite-workflow/review", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      }),
      { params: Promise.resolve({ bookId: "book-1" }) },
    );

    expect(response.status).toBe(403);
  });

  it("assigns reviewer and transitions review status to assigned", async () => {
    canManageBookWorkflowMock.mockResolvedValueOnce(true);
    let upsertPayload: Record<string, unknown> | null = null;

    const from = vi.fn((table: string) => {
      if (table !== "rewrite_workflows") throw new Error(`Unexpected table ${table}`);

      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        maybeSingle: vi.fn(async () => ({ data: { id: "workflow-1", reviewer_id: null, review_status: "unassigned" }, error: null })),
        upsert: vi.fn((payload: Record<string, unknown>) => {
          upsertPayload = payload;
          return builder;
        }),
        single: vi.fn(async () => ({
          data: {
            id: "workflow-1",
            book_id: "book-1",
            reviewer_id: "11111111-1111-4111-8111-111111111111",
            review_status: "assigned",
            review_notes: null,
            review_updated_at: "2026-06-02T00:00:00.000Z",
          },
          error: null,
        })),
      };

      return builder;
    });

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "actor-1" } } })),
      },
      from,
    });

    const response = await PATCH(
      new Request("http://localhost/api/books/book-1/rewrite-workflow/review", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "assign", reviewerId: "11111111-1111-4111-8111-111111111111" }),
      }),
      { params: Promise.resolve({ bookId: "book-1" }) },
    );

    const payload = await response.json();
    expect(response.status, JSON.stringify(payload)).toBe(200);
    // TypeScript 6's control-flow analysis over-narrows `upsertPayload` here
    // (the `let ... = null` above appears "still in effect" across the
    // intervening `await POST(...)` even though the mocked upsert()
    // reassigns it) -- an explicit re-cast breaks that over-eager narrowing.
    const finalUpsertPayload = upsertPayload as Record<string, unknown> | null;
    expect(finalUpsertPayload?.review_status).toBe("assigned");
    expect(finalUpsertPayload?.reviewer_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(addNotificationMock).toHaveBeenCalled();
  });
});
