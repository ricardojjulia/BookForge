import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { buildFinalManuscriptEpub } from "@/lib/export/epub";
import type { BuildMarkdownInput } from "@/lib/export/markdown";

function buildInput(overrides: Partial<BuildMarkdownInput> = {}): BuildMarkdownInput {
  return {
    book: { title: "日本語の本", author_name: "著者" },
    chapters: [{ id: "ch1", chapter_number: 1, title: "第一章" }],
    paragraphs: [
      {
        id: "p1",
        chapter_id: "ch1",
        scene_id: null,
        paragraph_number: 1,
        original_text: "これは本文です。",
        current_text: null,
        accepted_text: null,
        is_locked: false,
      },
    ],
    sourceMode: "original",
    includeFrontMatter: false,
    includeBackMatter: false,
    useOriginalForLocked: true,
    ...overrides,
  };
}

describe("buildFinalManuscriptEpub", () => {
  it("sets the book's actual language on every XHTML document, not just the OPF package metadata", async () => {
    const buffer = await buildFinalManuscriptEpub(buildInput(), { language: "ja" });
    const zip = await JSZip.loadAsync(buffer);

    const nav = await zip.file("EPUB/nav.xhtml")?.async("string");
    const chapter = await zip.file("EPUB/chapter-1.xhtml")?.async("string");
    const opf = await zip.file("EPUB/content.opf")?.async("string");

    expect(nav).toContain('lang="ja"');
    expect(chapter).toContain('lang="ja"');
    expect(opf).toContain("<dc:language>ja</dc:language>");
    expect(nav).not.toContain('lang="en"');
    expect(chapter).not.toContain('lang="en"');
  });

  it("falls back to English when no language is provided", async () => {
    const buffer = await buildFinalManuscriptEpub(buildInput());
    const zip = await JSZip.loadAsync(buffer);
    const chapter = await zip.file("EPUB/chapter-1.xhtml")?.async("string");
    expect(chapter).toContain('lang="en"');
  });
});
