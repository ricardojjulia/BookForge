import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/books/[bookId]/rewrite-plan/route";

const { mockCreateClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

describe("POST /api/books/[bookId]/rewrite-plan", () => {
  it("queues a durable rewrite plan job when serverManaged is true", async () => {
    const snapshotSingle = vi.fn(async () => ({
      data: {
        id: "11111111-1111-4111-8111-111111111111",
        book_id: "book-1",
        branch_name: "main",
        parent_snapshot_id: null,
        status: "active",
        title: "Baseline",
        summary: null,
        metadata_json: {},
        source_type: "initial_plan",
        source_ref_id: null,
        created_by: "user-1",
        created_at: "2026-07-27T00:00:00.000Z",
        updated_at: "2026-07-27T00:00:00.000Z",
        archived_at: null,
      },
      error: null,
    }));
    const snapshotEqId = vi.fn(() => ({ single: snapshotSingle }));
    const snapshotEqBook = vi.fn(() => ({ eq: snapshotEqId }));
    const snapshotSelect = vi.fn(() => ({ eq: snapshotEqBook }));

    const insertSingle = vi.fn(async () => ({ data: { id: "22222222-2222-4222-8222-222222222222" }, error: null }));
    const insertSelect = vi.fn(() => ({ single: insertSingle }));
    const insert = vi.fn(() => ({ select: insertSelect }));

    const revisionJobsBuilder = {
      insert,
    };

    const from = vi.fn((table: string) => {
      if (table === "book_metadata_snapshots") return { select: snapshotSelect };
      if (table === "revision_jobs") return revisionJobsBuilder;
      throw new Error(`Unexpected table ${table}`);
    });

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from,
    });

    const response = await POST(
      new Request("http://localhost/api/books/book-1/rewrite-plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          serverManaged: true,
          metadataSnapshotId: "11111111-1111-4111-8111-111111111111",
          metadataBranchName: "main",
        }),
      }),
      { params: Promise.resolve({ bookId: "book-1" }) },
    );

    const payload = await response.json();
    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.content?.queued).toBe(true);
    expect(payload.content?.jobId).toBe("22222222-2222-4222-8222-222222222222");
    expect(payload.content?.metadataSnapshotId).toBe("11111111-1111-4111-8111-111111111111");
    expect(payload.content?.metadataBranchName).toBe("main");
  });
});
