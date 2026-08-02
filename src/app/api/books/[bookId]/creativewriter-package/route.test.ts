import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/books/[bookId]/creativewriter-package/route";

const { mockCreateClient, mockBuildPackage } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockBuildPackage: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

vi.mock("@/lib/creativewriter-cloud/package-transfer", () => ({
  buildCreativeWriterPackageFromRows: mockBuildPackage,
}));

describe("GET /api/books/[bookId]/creativewriter-package", () => {
  it("returns a logical CreativeWriter package for an authenticated user", async () => {
    mockBuildPackage.mockReturnValue({
      manifest: {
        formatVersion: "1",
        packageId: "cloud-book-1",
        createdAt: "2026-08-02T00:00:00.000Z",
        updatedAt: "2026-08-02T00:00:00.000Z",
        mode: "cloud_linked",
        book: { title: "The Forge" },
        cloud: { accountId: "user-1", bookId: "book-1" },
      },
      entries: [{ path: "bookforge.yml", kind: "manifest", content: "" }],
    });

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null })),
      },
      from: vi.fn((table: string) => createSelectBuilder(table)),
    });

    const response = await GET(new Request("http://localhost/api/books/book-1/creativewriter-package?sourceMode=current"), {
      params: Promise.resolve({ bookId: "book-1" }),
    });
    const payload = await response.json();

    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.content.downloadName).toBe("the-forge.bookforge.json");
    expect(payload.content.sourceMode).toBe("current");
    expect(mockBuildPackage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        sourceMode: "current",
      }),
    );
  });
});

function createSelectBuilder(table: string) {
  const builder = {
    select() {
      return builder;
    },
    eq() {
      return builder;
    },
    order() {
      return builder;
    },
    limit() {
      return builder;
    },
    async single() {
      if (table === "books") {
        return { data: { id: "book-1", title: "The Forge", author_name: "Author", status: "draft" }, error: null };
      }
      return { data: null, error: null };
    },
    async maybeSingle() {
      if (table === "book_bibles") return { data: { content: { voice: "steady" }, updated_at: "2026-08-02T00:00:00.000Z" }, error: null };
      return { data: null, error: null };
    },
    then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
      if (table === "chapters") return resolve({ data: [{ id: "chapter-1", chapter_number: 1, title: "Opening", summary: null }], error: null });
      if (table === "paragraphs") {
        return resolve({
          data: [{ id: "p-1", chapter_id: "chapter-1", paragraph_number: 1, original_text: "Original", current_text: "Current", accepted_text: "Accepted" }],
          error: null,
        });
      }
      if (table === "revision_versions") return resolve({ data: [], error: null });
      return resolve({ data: [], error: null });
    },
  };
  return builder;
}
