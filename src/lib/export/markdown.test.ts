import { describe, expect, it } from "vitest";
import { buildFinalManuscriptMarkdown, selectExportParagraphText, type BuildMarkdownInput, type ParagraphForExport } from "@/lib/export/markdown";

function buildInput(overrides: Partial<BuildMarkdownInput> = {}): BuildMarkdownInput {
  return {
    book: { title: "My Life Story", author_name: "Ricardo Julia" },
    chapters: [{ id: "ch1", chapter_number: 1, title: "II. Current Life" }],
    paragraphs: [],
    sourceMode: "accepted",
    includeFrontMatter: false,
    includeBackMatter: false,
    useOriginalForLocked: true,
    ...overrides,
  };
}

function paragraph(overrides: Partial<ParagraphForExport> = {}): ParagraphForExport {
  return {
    id: "p1",
    chapter_id: "ch1",
    scene_id: null,
    paragraph_number: 1,
    original_text: "F. Strengths and Weaknesses",
    current_text: null,
    accepted_text: null,
    is_locked: false,
    ...overrides,
  };
}

describe("selectExportParagraphText", () => {
  it("omits a never-rewritten structural-heading paragraph in accepted mode", () => {
    const result = selectExportParagraphText(paragraph(), { sourceMode: "accepted", useOriginalForLocked: true });
    expect(result).toBeNull();
  });

  it("omits a never-rewritten structural-heading paragraph in latest mode", () => {
    const result = selectExportParagraphText(paragraph(), { sourceMode: "latest", useOriginalForLocked: true });
    expect(result).toBeNull();
  });

  it("still shows the raw heading text in original mode (faithful source reproduction)", () => {
    const result = selectExportParagraphText(paragraph(), { sourceMode: "original", useOriginalForLocked: true });
    expect(result).toBe("F. Strengths and Weaknesses");
  });

  it("shows the rewritten text for a heading-shaped paragraph that WAS actually rewritten", () => {
    const result = selectExportParagraphText(
      paragraph({ accepted_text: "Getting Along With People had always come naturally to me." }),
      { sourceMode: "accepted", useOriginalForLocked: true },
    );
    expect(result).toBe("Getting Along With People had always come naturally to me.");
  });

  it("does not omit an ordinary un-rewritten short sentence that isn't a heading", () => {
    const result = selectExportParagraphText(paragraph({ original_text: "Then there is the grace of my marriage." }), {
      sourceMode: "accepted",
      useOriginalForLocked: true,
    });
    expect(result).toBe("Then there is the grace of my marriage.");
  });

  it("always shows a locked paragraph's original text regardless of heading-shape", () => {
    const result = selectExportParagraphText(paragraph({ is_locked: true }), {
      sourceMode: "accepted",
      useOriginalForLocked: true,
    });
    expect(result).toBe("F. Strengths and Weaknesses");
  });
});

describe("buildFinalManuscriptMarkdown", () => {
  it("drops outline-header fragments from the rendered chapter body instead of leaving them as raw debris", () => {
    const markdown = buildFinalManuscriptMarkdown(
      buildInput({
        paragraphs: [
          paragraph({ id: "p1", paragraph_number: 1, original_text: "F. Strengths and Weaknesses" }),
          paragraph({
            id: "p2",
            paragraph_number: 2,
            original_text: "One of my strengths is my ability to relate to different kinds of people.",
            accepted_text: "One of my strengths has always been my ability to connect with people from all walks of life.",
          }),
        ],
      }),
    );

    expect(markdown).not.toContain("F. Strengths and Weaknesses");
    expect(markdown).toContain("One of my strengths has always been my ability to connect with people from all walks of life.");
  });
});
