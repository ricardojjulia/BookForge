import { describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/books/[bookId]/metadata/snapshots/route";

const { mockCreateClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

describe("metadata snapshots route", () => {
  it("lists snapshots and branches", async () => {
    const snapshots = [
      {
        id: "snapshot-1",
        book_id: "book-1",
        branch_name: "main",
        parent_snapshot_id: null,
        status: "active",
        title: "Baseline",
        summary: "Initial baseline",
        metadata_json: { purpose: "keep aligned" },
        source_type: "initial_plan",
        source_ref_id: null,
        created_by: "user-1",
        created_at: "2026-07-27T00:00:00.000Z",
        updated_at: "2026-07-27T00:00:00.000Z",
        archived_at: null,
      },
    ];
    const branches = [
      {
        id: "branch-1",
        book_id: "book-1",
        name: "main",
        head_snapshot_id: "snapshot-1",
        is_default: true,
        created_by: "user-1",
        created_at: "2026-07-27T00:00:00.000Z",
        updated_at: "2026-07-27T00:00:00.000Z",
      },
    ];

    const snapshotQuery = {
      select: () => snapshotQuery,
      eq: () => snapshotQuery,
      order: () => snapshotQuery,
      limit: () => snapshotQuery,
      lt: () => snapshotQuery,
      then: (resolve: (value: { data: typeof snapshots; error: null }) => void) => resolve({ data: snapshots, error: null }),
    };
    const branchQuery = {
      select: () => branchQuery,
      eq: () => branchQuery,
      order: () => branchQuery,
      then: (resolve: (value: { data: typeof branches; error: null }) => void) => resolve({ data: branches, error: null }),
    };

    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
      from: vi.fn((table: string) => {
        if (table === "book_metadata_snapshots") return snapshotQuery;
        if (table === "book_metadata_branches") return branchQuery;
        throw new Error(`Unexpected table ${table}`);
      }),
    });

    const response = await GET(new Request("http://localhost/api/books/book-1/metadata/snapshots"), { params: Promise.resolve({ bookId: "book-1" }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.snapshots).toHaveLength(1);
    expect(payload.branches).toHaveLength(1);
  });

  it("creates a metadata snapshot and branch", async () => {
    const bookMaybeSingle = vi.fn(async () => ({
      data: {
        id: "book-1",
        title: "My Book",
        author_name: "Author",
        genre: "Fiction",
        target_audience: "Adults",
        point_of_view: "Third person",
        tense: "Past",
        status: "draft",
      },
      error: null,
    }));
    const bookEq = vi.fn(() => ({ maybeSingle: bookMaybeSingle }));
    const bookSelect = vi.fn(() => ({ eq: bookEq }));

    const deactivateQuery = {
      update: () => deactivateQuery,
      eq: () => deactivateQuery,
      then: (resolve: (value: { error: null }) => void) => resolve({ error: null }),
    };

    const snapshotRow = {
      id: "snapshot-2",
      book_id: "book-1",
      branch_name: "main",
      parent_snapshot_id: null,
      status: "active",
      title: "My Book baseline",
      summary: "Initial metadata baseline seeded from current book state.",
      metadata_json: { purpose: "keep aligned" },
      source_type: "manual_edit",
      source_ref_id: null,
      created_by: "user-1",
      created_at: "2026-07-27T00:00:00.000Z",
      updated_at: "2026-07-27T00:00:00.000Z",
      archived_at: null,
    };
    const snapshotInsert = {
      select: () => ({ single: () => Promise.resolve({ data: snapshotRow, error: null }) }),
    };

    const branchRow = {
      id: "branch-2",
      book_id: "book-1",
      name: "main",
      head_snapshot_id: "snapshot-2",
      is_default: true,
      created_by: "user-1",
      created_at: "2026-07-27T00:00:00.000Z",
      updated_at: "2026-07-27T00:00:00.000Z",
    };
    const branchUpsert = { select: () => ({ single: () => Promise.resolve({ data: branchRow, error: null }) }) };

    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
      from: vi.fn((table: string) => {
        if (table === "books") return { select: bookSelect };
        if (table === "book_metadata_snapshots") {
          return {
            update: () => deactivateQuery,
            insert: () => snapshotInsert,
          };
        }
        if (table === "book_metadata_branches") return { upsert: () => branchUpsert };
        throw new Error(`Unexpected table ${table}`);
      }),
    });

    const response = await POST(
      new Request("http://localhost/api/books/book-1/metadata/snapshots", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ metadataJson: { purpose: "keep aligned" } }),
      }),
      { params: Promise.resolve({ bookId: "book-1" }) },
    );

    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.snapshot.id).toBe("snapshot-2");
    expect(payload.branch.name).toBe("main");
  });
});
