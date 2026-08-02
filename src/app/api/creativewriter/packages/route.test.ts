import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/creativewriter/packages/route";

const { mockCreateClient, mockInsertPackage } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockInsertPackage: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

vi.mock("@/lib/creativewriter-cloud/package-transfer", () => ({
  insertCreativeWriterPackage: mockInsertPackage,
}));

describe("POST /api/creativewriter/packages", () => {
  it("imports a logical package through the BookForge API boundary", async () => {
    mockInsertPackage.mockResolvedValue({
      bookId: "book-1",
      projectId: "project-1",
      chapterCount: 1,
      paragraphCount: 2,
    });
    const supabase = {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null })),
      },
    };
    mockCreateClient.mockResolvedValue(supabase);

    const response = await POST(
      new Request("http://localhost/api/creativewriter/packages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectName: "Imported Forge",
          package: minimalPackage(),
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.content).toEqual({
      imported: true,
      bookId: "book-1",
      projectId: "project-1",
      chapterCount: 1,
      paragraphCount: 2,
    });
    expect(mockInsertPackage).toHaveBeenCalledWith({
      supabase,
      userId: "user-1",
      projectName: "Imported Forge",
      pkg: expect.objectContaining({ manifest: expect.objectContaining({ packageId: "pkg-1" }) }),
    });
  });

  it("requires authentication", async () => {
    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      },
    });

    const response = await POST(
      new Request("http://localhost/api/creativewriter/packages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ package: minimalPackage() }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toBe("Authentication required.");
  });
});

function minimalPackage() {
  return {
    manifest: {
      formatVersion: "1",
      packageId: "pkg-1",
      createdAt: "2026-08-02T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
      mode: "local_only",
      book: { title: "The Forge" },
    },
    entries: [
      { path: "bookforge.yml", kind: "manifest", content: "" },
      { path: "manuscript/001-opening.md", kind: "manuscript", content: "# Opening\n\nParagraph one.\n\nParagraph two.\n" },
    ],
  };
}
