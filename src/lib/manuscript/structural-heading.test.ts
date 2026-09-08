import { describe, expect, it } from "vitest";
import { looksLikeStructuralHeading } from "@/lib/manuscript/structural-heading";

describe("looksLikeStructuralHeading", () => {
  it("recognizes outline-letter and outline-number sub-headings", () => {
    expect(looksLikeStructuralHeading("F. Strengths and Weaknesses")).toBe(true);
    expect(looksLikeStructuralHeading("A. Singleness")).toBe(true);
    expect(looksLikeStructuralHeading("1. Getting Started")).toBe(true);
  });

  it("recognizes bare Roman-numeral chapter headings", () => {
    expect(looksLikeStructuralHeading("I. Growing Up Years")).toBe(true);
    expect(looksLikeStructuralHeading("V. Future")).toBe(true);
  });

  it("recognizes title-case headings with no numbering prefix", () => {
    expect(looksLikeStructuralHeading("Getting Along With People")).toBe(true);
    expect(looksLikeStructuralHeading("Relating With Authority Figures")).toBe(true);
  });

  it("recognizes title-page front matter (title, subtitle, author name)", () => {
    expect(looksLikeStructuralHeading("My Life Story")).toBe(true);
    expect(looksLikeStructuralHeading("The Story of My Calling")).toBe(true);
    expect(looksLikeStructuralHeading("Ricardo J. Julia Diaz")).toBe(true);
  });

  it("recognizes standalone Introduction/Conclusion markers", () => {
    expect(looksLikeStructuralHeading("Introduction")).toBe(true);
    expect(looksLikeStructuralHeading("Conclusion")).toBe(true);
  });

  it("recognizes a paragraph that is exactly its own chapter's title", () => {
    expect(looksLikeStructuralHeading("Growing Up", "Growing Up")).toBe(true);
  });

  it("does not flag an ordinary short sentence of real prose", () => {
    expect(looksLikeStructuralHeading("Then there is the grace of my marriage.")).toBe(false);
    expect(looksLikeStructuralHeading("Yes.")).toBe(false);
    expect(looksLikeStructuralHeading("She said no.")).toBe(false);
  });

  it("does not flag an arbitrary unpunctuated single word as a heading", () => {
    expect(looksLikeStructuralHeading("Wait")).toBe(false);
    expect(looksLikeStructuralHeading("Stop")).toBe(false);
  });

  it("does not flag a long paragraph even if it happens to be all capitalized words", () => {
    const longTitleCase = "This Is A Very Long Line That Happens To Capitalize Every Single Word In It";
    expect(looksLikeStructuralHeading(longTitleCase)).toBe(false);
  });

  it("does not flag a normal lowercase-heavy sentence with no terminal punctuation", () => {
    expect(looksLikeStructuralHeading("and then, silence")).toBe(false);
  });
});
