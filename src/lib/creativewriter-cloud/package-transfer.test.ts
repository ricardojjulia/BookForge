import { describe, expect, it, vi } from "vitest";
import { buildBookForgePackage } from "@/lib/bookforge-package";
import {
  buildCreativeWriterPackageFromRows,
  insertCreativeWriterPackage,
  parseCreativeWriterUploadPackage,
} from "@/lib/creativewriter-cloud/package-transfer";

const timestamp = "2026-08-02T00:00:00.000Z";

describe("CreativeWriter package transfer", () => {
  it("builds a cloud-linked package with sync and revision metadata", () => {
    const pkg = buildCreativeWriterPackageFromRows({
      userId: "user-1",
      timestamp,
      rows: {
        book: { id: "book-1", title: "The Forge", author_name: "Author", status: "draft" },
        chapters: [{ id: "chapter-1", chapter_number: 1, title: "Opening" }],
        paragraphs: [{ id: "p-1", chapter_id: "chapter-1", paragraph_number: 1, original_text: "Original", accepted_text: "Accepted" }],
        revisions: [{ id: "r-1", paragraph_id: "p-1", revised_text: "Revised", revision_notes: null, accepted: false, rejected: false, created_at: timestamp }],
      },
    });

    expect(pkg.manifest.mode).toBe("cloud_linked");
    expect(pkg.manifest.cloud?.bookId).toBe("book-1");
    expect(pkg.entries.map((entry) => entry.path)).toContain("metadata/sync.json");
    expect(pkg.entries.map((entry) => entry.path)).toContain("metadata/revisions.json");
  });

  it("parses an upload package into chapter scenes", () => {
    const pkg = buildBookForgePackage({
      packageId: "pkg-1",
      createdAt: timestamp,
      updatedAt: timestamp,
      book: { title: "The Forge", author_name: "Author" },
      chapters: [{ id: "chapter-1", chapter_number: 1, title: "Opening" }],
      paragraphs: [
        { id: "p-1", chapter_id: "chapter-1", paragraph_number: 1, original_text: "Paragraph one." },
        { id: "p-2", chapter_id: "chapter-1", paragraph_number: 2, original_text: "Paragraph two." },
      ],
    });

    const parsed = parseCreativeWriterUploadPackage(pkg);

    expect(parsed.book.title).toBe("The Forge");
    expect(parsed.chapters).toHaveLength(1);
    expect(parsed.chapters[0].scenes[0].paragraphs).toHaveLength(2);
    expect(parsed.chapters[0].text).not.toMatch(/^# Opening/);
  });

  it("inserts a package as normal BookForge rows", async () => {
    const pkg = buildBookForgePackage({
      packageId: "pkg-1",
      createdAt: timestamp,
      updatedAt: timestamp,
      book: { title: "The Forge" },
      chapters: [{ id: "chapter-1", chapter_number: 1, title: "Opening" }],
      paragraphs: [{ id: "p-1", chapter_id: "chapter-1", paragraph_number: 1, original_text: "Paragraph one." }],
    });

    const inserted = {
      projects: [] as unknown[],
      books: [] as unknown[],
      chapters: [] as unknown[],
      scenes: [] as unknown[],
      paragraphs: [] as unknown[],
      reports: [] as unknown[],
    };
    const supabase = createInsertOnlySupabase(inserted);

    const result = await insertCreativeWriterPackage({ supabase, userId: "user-1", pkg });

    expect(result.bookId).toBe("book-1");
    expect(result.chapterCount).toBe(1);
    expect(result.paragraphCount).toBe(1);
    expect(inserted.projects).toHaveLength(1);
    expect(inserted.books).toHaveLength(1);
    expect(inserted.chapters).toHaveLength(1);
    expect(inserted.scenes).toHaveLength(1);
    expect(inserted.paragraphs).toHaveLength(1);
    expect(inserted.reports).toHaveLength(1);
  });
});

function createInsertOnlySupabase(inserted: {
  projects: unknown[];
  books: unknown[];
  chapters: unknown[];
  scenes: unknown[];
  paragraphs: unknown[];
  reports: unknown[];
}) {
  const ids: Record<string, string> = {
    projects: "project-1",
    books: "book-1",
    chapters: "chapter-row-1",
    scenes: "scene-1",
  };

  return {
    from: vi.fn((table: string) => {
      const builder = {
        insert(payload: unknown) {
        if (table === "projects") inserted.projects.push(payload);
        if (table === "books") inserted.books.push(payload);
        if (table === "chapters") inserted.chapters.push(payload);
        if (table === "scenes") inserted.scenes.push(payload);
        if (table === "paragraphs") inserted.paragraphs.push(payload);
        if (table === "coherence_reports") inserted.reports.push(payload);

        return builder;
      },
      select() {
        return builder;
      },
      async single() {
        return { data: { id: ids[table] }, error: null };
      },
      then(resolve: (value: { error: null }) => unknown) {
        return resolve({ error: null });
      },
      };
      return builder;
    }),
  };
}
