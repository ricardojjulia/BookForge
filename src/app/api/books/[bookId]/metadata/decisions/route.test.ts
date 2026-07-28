import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/books/[bookId]/metadata/decisions/route";

const { mockCreateClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

describe("metadata decisions route", () => {
  it("records a decision for a snapshot", async () => {
    const snapshotSingle = vi.fn(async () => ({
      data: {
        id: "11111111-1111-4111-8111-111111111111",
        book_id: "book-1",
      },
      error: null,
    }));
    const snapshotEqBook = vi.fn(() => ({ single: snapshotSingle }));
    const snapshotEqId = vi.fn(() => ({ eq: snapshotEqBook }));
    const snapshotSelect = vi.fn(() => ({ eq: snapshotEqId }));

    const decisionSingle = vi.fn(async () => ({
      data: {
        id: "decision-1",
        book_id: "book-1",
        snapshot_id: "11111111-1111-4111-8111-111111111111",
        decision_type: "accept",
        subject_type: "recommendation",
        subject_ref: "r1",
        rationale: "Good call",
        created_by: "user-1",
        created_at: "2026-07-27T00:00:00.000Z",
      },
      error: null,
    }));
    const decisionInsert = { select: () => ({ single: decisionSingle }) };

    const bookMaybeSingle = vi.fn(async () => ({ data: { id: "book-1" }, error: null }));
    const bookEq = vi.fn(() => ({ maybeSingle: bookMaybeSingle }));
    const bookSelect = vi.fn(() => ({ eq: bookEq }));

    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
      from: vi.fn((table: string) => {
        if (table === "books") return { select: bookSelect };
        if (table === "book_metadata_snapshots") return { select: snapshotSelect };
        if (table === "book_metadata_decisions") return { insert: () => decisionInsert };
        throw new Error(`Unexpected table ${table}`);
      }),
    });

    const response = await POST(
      new Request("http://localhost/api/books/book-1/metadata/decisions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          snapshotId: "11111111-1111-4111-8111-111111111111",
          decisionType: "accept",
          subjectType: "recommendation",
          subjectRef: "r1",
          rationale: "Good call",
        }),
      }),
      { params: Promise.resolve({ bookId: "book-1" }) },
    );

    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.decision.id).toBe("decision-1");
  });
});
