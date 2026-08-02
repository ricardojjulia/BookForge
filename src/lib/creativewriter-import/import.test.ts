import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildCreativeWriterPackageFromImport, creativeWriterImportLimits } from "@/lib/creativewriter-import";

describe("buildCreativeWriterPackageFromImport", () => {
  it("imports multiple Markdown files as ordered manuscript chapters", async () => {
    const result = await buildCreativeWriterPackageFromImport({
      files: [
        makeFile("001-opening.md", "Opening paragraph.\n\nSecond paragraph."),
        makeFile("002-arrival.md", "Arrival paragraph."),
      ],
      title: "The Forge",
      timestamp: "2026-08-02T00:00:00.000Z",
    });

    const manuscriptEntries = result.package.entries.filter((entry) => entry.kind === "manuscript");
    expect(result.source).toBe("markdown_folder");
    expect(manuscriptEntries.map((entry) => entry.path)).toEqual(["manuscript/001-opening.md", "manuscript/002-arrival.md"]);
  });

  it("imports Wavemaker-style JSON text fields", async () => {
    const text = "This is a long enough chapter body with many words so the importer treats it as real author text for the manuscript.";
    const result = await buildCreativeWriterPackageFromImport({
      files: [makeFile("project.wmProj", JSON.stringify({ chapters: [{ title: "Opening", body: text }] }))],
      timestamp: "2026-08-02T00:00:00.000Z",
    });

    expect(result.source).toBe("wavemaker");
    expect(result.manuscriptEntryCount).toBe(1);
    expect(result.package.entries.find((entry) => entry.kind === "manuscript")?.content).toContain("long enough chapter body");
  });

  it("imports readable archive entries and separates notes", async () => {
    const zip = new JSZip();
    zip.file(
      "manuscript/001-opening.nwd",
      "Opening paragraph from novelWriter with enough manuscript words to pass the author-text guard.\n\nSecond paragraph continues the imported scene.",
    );
    zip.file("notes/research.md", "These are background notes with enough words to be captured by the importer.");
    const archive = await zip.generateAsync({ type: "uint8array" });

    const result = await buildCreativeWriterPackageFromImport({
      files: [makeFile("novelwriter-export.zip", archive)],
      source: "novelwriter",
      timestamp: "2026-08-02T00:00:00.000Z",
    });

    expect(result.source).toBe("novelwriter");
    expect(result.manuscriptEntryCount).toBe(1);
    expect(result.noteEntryCount).toBe(1);
    expect(result.package.entries.map((entry) => entry.kind)).toContain("note");
  });

  it("warns on legacy .doc and fails without readable manuscript text", async () => {
    await expect(
      buildCreativeWriterPackageFromImport({
        files: [makeFile("old-manuscript.doc", "legacy")],
        timestamp: "2026-08-02T00:00:00.000Z",
      }),
    ).rejects.toThrow(/No readable manuscript text/);
  });

  it("rejects imports that exceed the request file count limit", async () => {
    await expect(
      buildCreativeWriterPackageFromImport({
        files: Array.from({ length: creativeWriterImportLimits.maxFiles + 1 }, (_, index) => makeFile(`chapter-${index + 1}.md`, "Chapter text.")),
        timestamp: "2026-08-02T00:00:00.000Z",
      }),
    ).rejects.toThrow(/accepts up to/);
  });

  it("validates uploaded .bookforge.json packages before import", async () => {
    await expect(
      buildCreativeWriterPackageFromImport({
        files: [makeFile("broken.bookforge.json", JSON.stringify({ entries: [] }))],
        timestamp: "2026-08-02T00:00:00.000Z",
      }),
    ).rejects.toThrow();
  });
});

function makeFile(name: string, content: string | Uint8Array): File {
  const buffer = typeof content === "string" ? Buffer.from(content) : Buffer.from(content);
  return {
    name,
    size: buffer.length,
    type: "",
    async arrayBuffer() {
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    },
  } as File;
}
