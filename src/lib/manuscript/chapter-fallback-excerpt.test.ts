import { describe, expect, it } from "vitest";
import { buildChapterFallbackExcerpts } from "@/lib/manuscript/chapter-fallback-excerpt";

describe("buildChapterFallbackExcerpts", () => {
  it("joins a chapter's paragraphs in order, preferring accepted_text over original_text", () => {
    const chapters = [{ id: "ch-1" }, { id: "ch-2" }];
    const paragraphs = [
      { chapter_id: "ch-1", paragraph_number: 2, original_text: "Second paragraph." },
      { chapter_id: "ch-1", paragraph_number: 1, original_text: "First paragraph.", accepted_text: "Revised first paragraph." },
      { chapter_id: "ch-2", paragraph_number: 1, original_text: "Other chapter." },
    ];

    const excerpts = buildChapterFallbackExcerpts(chapters, paragraphs);

    expect(excerpts.get("ch-1")).toBe("Revised first paragraph.\n\nSecond paragraph.");
    expect(excerpts.get("ch-2")).toBe("Other chapter.");
  });

  it("omits a chapter with no paragraphs rather than returning an empty string", () => {
    const excerpts = buildChapterFallbackExcerpts([{ id: "ch-empty" }], []);
    expect(excerpts.has("ch-empty")).toBe(false);
  });

  it("caps a very long chapter's excerpt instead of returning the full text", () => {
    const longText = "a".repeat(10_000);
    const excerpts = buildChapterFallbackExcerpts(
      [{ id: "ch-1" }],
      [{ chapter_id: "ch-1", paragraph_number: 1, original_text: longText }],
    );

    expect(excerpts.get("ch-1")?.length).toBeLessThan(10_000);
  });
});
