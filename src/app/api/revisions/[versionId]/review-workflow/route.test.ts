import { describe, expect, it, vi } from "vitest";
import { PATCH } from "@/app/api/revisions/[versionId]/review-workflow/route";

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

describe("PATCH /api/revisions/[versionId]/review-workflow", () => {
  it("assigns reviewer and updates review status", async () => {
    let updatePayload: Record<string, unknown> | null = null;
    const from = vi.fn((table: string) => {
      if (table !== "revision_versions") throw new Error(`Unexpected table ${table}`);

      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        single: vi
          .fn()
          .mockResolvedValueOnce({
            data: {
              id: "version-1",
              book_id: "book-1",
              chapter_id: "chapter-1",
              paragraph_id: "paragraph-1",
              review_status: "unassigned",
              reviewer_id: null,
            },
            error: null,
          })
          .mockResolvedValue({
            data: {
              id: "version-1",
              book_id: "book-1",
              reviewer_id: "11111111-1111-4111-8111-111111111111",
              review_status: "assigned",
              review_notes: null,
              review_updated_at: "2026-06-02T00:00:00.000Z",
            },
            error: null,
          }),
        update: vi.fn((payload: Record<string, unknown>) => {
          updatePayload = payload;
          return builder;
        }),
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
      new Request("http://localhost/api/revisions/version-1/review-workflow", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "assign", reviewerId: "11111111-1111-4111-8111-111111111111" }),
      }),
      { params: Promise.resolve({ versionId: "version-1" }) },
    );

    const payload = await response.json();

    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(canManageBookWorkflowMock).toHaveBeenCalledWith(expect.anything(), "book-1", "actor-1");
    // TypeScript 6's control-flow analysis over-narrows `updatePayload` here
    // (the `let ... = null` above appears "still in effect" across the
    // intervening `await` even though the mocked update() reassigns it) --
    // an explicit re-cast breaks that over-eager narrowing.
    const finalUpdatePayload = updatePayload as Record<string, unknown> | null;
    expect(finalUpdatePayload?.review_status).toBe("assigned");
    expect(finalUpdatePayload?.reviewer_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(addNotificationMock).toHaveBeenCalled();
  });
});
