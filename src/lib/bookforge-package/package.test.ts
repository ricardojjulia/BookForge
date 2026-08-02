import { describe, expect, it } from "vitest";
import {
  bookForgePackageManifestSchema,
  buildBookForgePackage,
  buildChapterFilename,
  parseLogicalBookForgePackage,
} from "@/lib/bookforge-package";

describe("BookForge package manifest", () => {
  it("validates a local-only manifest", () => {
    const manifest = bookForgePackageManifestSchema.parse({
      formatVersion: "1",
      packageId: "pkg_test",
      createdAt: "2026-08-02T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
      mode: "local_only",
      book: { title: "The Forge" },
    });

    expect(manifest.book.title).toBe("The Forge");
  });

  it("rejects a cloud-linked manifest without cloud identity", () => {
    expect(() =>
      bookForgePackageManifestSchema.parse({
        formatVersion: "1",
        packageId: "pkg_test",
        createdAt: "2026-08-02T00:00:00.000Z",
        updatedAt: "2026-08-02T00:00:00.000Z",
        mode: "cloud_linked",
        book: { title: "The Forge" },
      }),
    ).toThrow(/cloud identity/);
  });
});

describe("buildChapterFilename", () => {
  it("creates deterministic sortable chapter filenames", () => {
    expect(buildChapterFilename({ chapter_number: 7, title: "Arrival: Fire & Iron!" })).toBe("007-arrival-fire-iron.md");
  });

  it("falls back when a chapter title is empty", () => {
    expect(buildChapterFilename({ chapter_number: 3, title: "" })).toBe("003-chapter-3.md");
  });
});

describe("BookForge logical package import/export", () => {
  const timestamp = "2026-08-02T00:00:00.000Z";

  it("exports two chapters into manuscript entries", () => {
    const pkg = buildBookForgePackage({
      packageId: "pkg_test",
      createdAt: timestamp,
      updatedAt: timestamp,
      book: { id: "book-1", title: "The Forge", author_name: "R. Author" },
      chapters: [
        { id: "chapter-1", chapter_number: 1, title: "Opening" },
        { id: "chapter-2", chapter_number: 2, title: "Arrival" },
      ],
      paragraphs: [
        { id: "p1", chapter_id: "chapter-1", paragraph_number: 1, original_text: "Original opening.", accepted_text: "Accepted opening." },
        { id: "p2", chapter_id: "chapter-1", paragraph_number: 2, original_text: "Second paragraph." },
        { id: "p3", chapter_id: "chapter-2", paragraph_number: 1, original_text: "Arrival paragraph." },
      ],
    });

    expect(pkg.entries.map((entry) => entry.path)).toEqual([
      "bookforge.yml",
      "manuscript/001-opening.md",
      "manuscript/002-arrival.md",
      "metadata/outline.json",
    ]);
    expect(pkg.entries.find((entry) => entry.path === "manuscript/001-opening.md")?.content).toContain("Accepted opening.");
  });

  it("imports manuscript entries in chapter order", () => {
    const pkg = buildBookForgePackage({
      packageId: "pkg_test",
      createdAt: timestamp,
      updatedAt: timestamp,
      book: { title: "The Forge" },
      chapters: [
        { id: "chapter-2", chapter_number: 2, title: "Arrival" },
        { id: "chapter-1", chapter_number: 1, title: "Opening" },
      ],
      paragraphs: [
        { id: "p2", chapter_id: "chapter-2", paragraph_number: 1, original_text: "Arrival paragraph." },
        { id: "p1", chapter_id: "chapter-1", paragraph_number: 1, original_text: "Opening paragraph." },
      ],
    });

    const parsed = parseLogicalBookForgePackage(pkg);

    expect(parsed.chapters.map((chapter) => chapter.title)).toEqual(["Opening", "Arrival"]);
    expect(parsed.chapters[0].frontmatter).toContain("bookforgeChapterId");
    expect(parsed.chapters[0].bodyMarkdown).toContain("# Opening");
  });
});
