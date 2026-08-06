import { describe, expect, it } from "vitest";
import { parseManuscript, stripPdfPageArtifacts } from "@/lib/manuscript/parser";

// Regression coverage for a real book (imported from PDF) where every
// chapter's "title" ended up being an ordinary narrative sentence instead
// of a real heading -- e.g. "While the coffee dripped, her phone vibrated
// on the granite surface. A calendar notification:" got treated as a
// chapter boundary purely because it's short and ends in a colon.
describe("isChapterStartLine (via parseManuscript)", () => {
  it("does not treat an ordinary narrative sentence ending in a colon as a chapter heading", () => {
    const filler = Array.from({ length: 40 }, (_, i) => `Body sentence number ${i} continues the scene.`).join(" ");
    const text = [
      `${filler}`,
      "",
      "While the coffee dripped, her phone vibrated on the granite surface. A calendar notification:",
      "",
      `${filler}`,
    ].join("\n");

    const result = parseManuscript(text, "Test Book");

    // Should fall through to the single-chapter fallback, NOT split on that
    // sentence -- it contains a complete sentence ("...granite surface.")
    // before the colon, which a real heading never does.
    expect(result.chapters).toHaveLength(1);
  });

  it("still detects a genuine standalone heading with a colon", () => {
    const filler = Array.from({ length: 40 }, (_, i) => `Body sentence number ${i} continues the scene.`).join(" ");
    const text = [
      `${filler}`,
      "",
      "Part Two: The Reckoning",
      "",
      `${filler}`,
    ].join("\n");

    const result = parseManuscript(text, "Test Book");

    expect(result.chapters.length).toBeGreaterThan(1);
    expect(result.chapters.some((chapter) => chapter.title === "Part Two: The Reckoning")).toBe(true);
  });
});

describe("stripPdfPageArtifacts", () => {
  it("removes '-- N of M --' page markers and bare-digit page-number lines", () => {
    const input = [
      "her grief. She entered only the necessary variables.",
      "-- 13 of 30 --",
      "1",
      "-- 14 of 30 --",
      "2",
      "The next real paragraph continues the story here.",
    ].join("\n");

    const result = stripPdfPageArtifacts(input);

    expect(result).not.toContain("-- 13 of 30 --");
    expect(result).not.toContain("-- 14 of 30 --");
    expect(result.split("\n")).not.toContain("1");
    expect(result.split("\n")).not.toContain("2");
    expect(result).toContain("her grief. She entered only the necessary variables.");
    expect(result).toContain("The next real paragraph continues the story here.");
  });

  it("does not remove real content lines that merely start with a digit", () => {
    const input = "9mm casings littered the floor near the door.";
    expect(stripPdfPageArtifacts(input)).toBe(input);
  });
});
