// pdfkit's registerFont ultimately does `src instanceof Uint8Array`, which
// fails across the separate global realm jsdom's environment sets up (a
// Node Buffer from fs.readFileSync is a Uint8Array of the *main* realm, not
// jsdom's) -- this only breaks under the test runner, not real server code,
// so this file opts back into a plain Node environment.
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildFinalManuscriptPdf } from "@/lib/export/pdf";
import type { BuildMarkdownInput } from "@/lib/export/markdown";

function buildInput(overrides: Partial<BuildMarkdownInput> = {}): BuildMarkdownInput {
  return {
    book: { title: "Тестовая книга: Ελληνικά и Français", author_name: "Автор Ñoño" },
    chapters: [{ id: "ch1", chapter_number: 1, title: "Глава первая — Chapitre" }],
    paragraphs: [
      {
        id: "p1",
        chapter_id: "ch1",
        scene_id: null,
        paragraph_number: 1,
        original_text: "Привет, γεια σου, café, żółw.",
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

describe("buildFinalManuscriptPdf", () => {
  it("embeds a TrueType font instead of relying on the Latin-1-only Helvetica base font", async () => {
    const buffer = await buildFinalManuscriptPdf(buildInput());
    const raw = buffer.toString("latin1");

    // A base-14 standard font (Helvetica) is referenced by name only, with
    // no embedded font program -- Cyrillic/Greek/Extended-Latin text drawn
    // with it renders as missing-glyph boxes. FontFile2 marks an embedded
    // TrueType font program, which is what makes those glyphs render.
    expect(raw).not.toContain("/BaseFont /Helvetica");
    expect(raw).toContain("/FontFile2");
  });

  it("builds successfully for a manuscript containing Cyrillic, Greek, and extended Latin text", async () => {
    const buffer = await buildFinalManuscriptPdf(buildInput());
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });
});
