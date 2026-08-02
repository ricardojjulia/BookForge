import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/creativewriter/import/route";

const { mockCreateClient, mockBuildImportPackage, mockInsertPackage } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockBuildImportPackage: vi.fn(),
  mockInsertPackage: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

vi.mock("@/lib/creativewriter-import", async () => {
  const { z } = await import("zod");
  return {
    buildCreativeWriterPackageFromImport: mockBuildImportPackage,
    creativeWriterImportSourceSchema: z.enum([
      "auto",
      "document",
      "markdown_folder",
      "novelwriter",
      "manuskript",
      "joplin",
      "zettlr",
      "logseq",
      "obsidian",
      "wavemaker",
      "bibisco",
      "quollwriter",
    ]),
  };
});

vi.mock("@/lib/creativewriter-cloud/package-transfer", () => ({
  insertCreativeWriterPackage: mockInsertPackage,
}));

describe("POST /api/creativewriter/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("imports uploaded files through package transfer", async () => {
    const pkg = {
      manifest: {
        formatVersion: "1",
        packageId: "pkg-import",
        createdAt: "2026-08-02T00:00:00.000Z",
        updatedAt: "2026-08-02T00:00:00.000Z",
        mode: "local_only",
        book: { title: "The Forge" },
      },
      entries: [{ path: "bookforge.yml", kind: "manifest", content: "" }],
    };
    mockBuildImportPackage.mockResolvedValue({
      package: pkg,
      source: "document",
      importedFileCount: 1,
      manuscriptEntryCount: 1,
      noteEntryCount: 0,
      warnings: [],
    });
    mockInsertPackage.mockResolvedValue({ bookId: "book-1", projectId: "project-1", chapterCount: 1, paragraphCount: 2 });
    const supabase = {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null })),
      },
    };
    mockCreateClient.mockResolvedValue(supabase);

    const formData = new FormData();
    formData.append("files", new File(["Chapter text"], "chapter.md", { type: "text/markdown" }));
    formData.append("title", "The Forge");
    formData.append("source", "document");

    const response = await POST(new Request("http://localhost/api/creativewriter/import", { method: "POST", body: formData }));
    const payload = await response.json();

    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.content.imported).toBe(true);
    expect(mockBuildImportPackage).toHaveBeenCalledWith(expect.objectContaining({ title: "The Forge", source: "document" }));
    expect(mockInsertPackage).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", pkg }));
  });

  it("requires authentication before reading import files", async () => {
    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      },
    });

    const formData = new FormData();
    formData.append("files", new File(["Chapter text"], "chapter.md", { type: "text/markdown" }));

    const response = await POST(new Request("http://localhost/api/creativewriter/import", { method: "POST", body: formData }));
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toMatch(/Authentication required/);
    expect(mockBuildImportPackage).not.toHaveBeenCalled();
  });
});
