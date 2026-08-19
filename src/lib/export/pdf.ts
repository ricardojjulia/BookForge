import { readFileSync } from "fs";
import { join } from "path";
import PDFDocument from "pdfkit";
import {
  humanizeSectionType,
  selectExportParagraphText,
  type BuildMarkdownInput,
  type MatterSectionForExport,
  type ParagraphForExport,
} from "@/lib/export/markdown";
import { repairCommonMojibake } from "@/lib/text/repair-mojibake";

// PDFKit's built-in "Helvetica"/"Helvetica-Bold" are PDF base-14 standard
// fonts covering only WinAnsi (Latin-1) -- any accented character outside
// that range (and all of Cyrillic, Greek, CJK, Arabic, Hebrew) silently
// renders as a missing-glyph box. Liberation Sans covers full Latin
// Extended, Cyrillic, and Greek (verified via fontkit), so registering it
// in place of Helvetica fixes export for every language that uses those
// scripts. It does NOT cover CJK/Arabic/Hebrew -- those need a dedicated
// font of their own, tracked separately.
const BODY_FONT = readFileSync(join(process.cwd(), "src/lib/export/fonts/LiberationSans-Regular.ttf"));
const BODY_FONT_BOLD = readFileSync(join(process.cwd(), "src/lib/export/fonts/LiberationSans-Bold.ttf"));

function registerBodyFonts(doc: PDFKit.PDFDocument) {
  doc.registerFont("Body", BODY_FONT);
  doc.registerFont("Body-Bold", BODY_FONT_BOLD);
}

const frontMatterTypes = new Set(["title_page", "copyright_page", "dedication", "foreword", "preface", "introduction"]);

const backMatterTypes = new Set([
  "acknowledgments",
  "author_bio",
  "appendix",
  "bibliography",
  "endnotes",
  "discussion_questions",
  "small_group_questions",
  "glossary",
]);

export type PdfOptions = {
  fontSize?: number;
  lineGap?: number;
  pageNumbers?: boolean;
  pageSize?: "LETTER" | "A4";
};

export async function buildFinalManuscriptPdf(input: BuildMarkdownInput, options: PdfOptions = {}) {
  const fontSize = Math.max(9, Math.min(14, options.fontSize || 11.5));
  const metadata: Record<string, string> = {
    Title: repairCommonMojibake(input.book.title || "Untitled Book"),
    Creator: "BookForge AI",
    Producer: "BookForge AI",
  };
  if (input.book.author_name?.trim()) {
    metadata.Author = repairCommonMojibake(input.book.author_name.trim());
  }

  const doc = new PDFDocument({
    autoFirstPage: false,
    size: options.pageSize || "LETTER",
    margins: { top: 72, right: 72, bottom: 72, left: 72 },
    bufferPages: true,
    info: metadata,
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  registerBodyFonts(doc);

  doc.addPage();
  doc.font("Body-Bold").fontSize(24).text(repairCommonMojibake(input.book.title.trim() || "Untitled Book"), {
    align: "center",
  });
  if (input.book.author_name) {
    doc.moveDown(0.75).font("Body").fontSize(13).text(`by ${repairCommonMojibake(input.book.author_name)}`, { align: "center" });
  }

  const sortedMatter = (input.matterSections || []).slice().sort((a, b) => {
    const sort = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (sort !== 0) return sort;
    return a.section_type.localeCompare(b.section_type);
  });

  if (input.includeFrontMatter) {
    appendMatter(doc, sortedMatter.filter((section) => frontMatterTypes.has(section.section_type)), {
      fontSize,
      lineGap: options.lineGap,
    });
  }

  const paragraphsByChapter = input.paragraphs.reduce<Record<string, ParagraphForExport[]>>((groups, paragraph) => {
    groups[paragraph.chapter_id] ||= [];
    groups[paragraph.chapter_id].push(paragraph);
    return groups;
  }, {});

  input.chapters.forEach((chapter) => {
    const chapterParagraphs = (paragraphsByChapter[chapter.id] || [])
      .slice()
      .sort((a, b) => a.paragraph_number - b.paragraph_number);
    if (!chapterParagraphs.length) return;

    addHeading(doc, repairCommonMojibake(chapter.title?.trim() || `Chapter ${chapter.chapter_number}`));

    let previousSceneId: string | null = null;
    chapterParagraphs.forEach((paragraph, index) => {
      if (index > 0 && paragraph.scene_id && previousSceneId && paragraph.scene_id !== previousSceneId) {
        doc.moveDown(0.75).font("Body").fontSize(12).text("***", { align: "center" }).moveDown(0.75);
      }
      appendBodyText(doc, selectExportParagraphText(paragraph, input), {
        fontSize,
        lineGap: options.lineGap,
      });
      previousSceneId = paragraph.scene_id;
    });
  });

  if (input.includeBackMatter) {
    appendMatter(doc, sortedMatter.filter((section) => backMatterTypes.has(section.section_type)), {
      fontSize,
      lineGap: options.lineGap,
    });
  }

  if (options.pageNumbers !== false) {
    addPageNumbers(doc);
  }
  doc.end();

  return new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function appendMatter(doc: PDFKit.PDFDocument, sections: MatterSectionForExport[], options: { fontSize: number; lineGap?: number }) {
  sections.forEach((section) => {
    addHeading(doc, section.title?.trim() || humanizeSectionType(section.section_type));
    appendBodyText(doc, repairCommonMojibake(section.content), options);
  });
}

function addHeading(doc: PDFKit.PDFDocument, title: string) {
  doc.addPage();
  doc.font("Body-Bold").fontSize(18).text(title, { align: "center" });
  doc.moveDown(1);
}

function appendBodyText(doc: PDFKit.PDFDocument, text: string, options: { fontSize: number; lineGap?: number }) {
  repairCommonMojibake(text)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .forEach((paragraph) => {
      doc.font("Body").fontSize(options.fontSize).text(paragraph, {
        align: "left",
        lineGap: options.lineGap ?? 3,
        paragraphGap: 8,
      });
    });
}

function addPageNumbers(doc: PDFKit.PDFDocument) {
  const range = doc.bufferedPageRange();
  for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex += 1) {
    doc.switchToPage(pageIndex);
    // The footer sits 50pt from the bottom edge, inside the page's 72pt
    // bottom margin. PDFKit's .text() checks the given y against the
    // printable area (page.height - margins.bottom) regardless of explicit
    // x/y positioning, and silently starts a brand-new blank page when it
    // thinks the text would fall outside it — doubling the page count for
    // every exported PDF (57 real pages became 114). Zeroing the bottom
    // margin for this one call keeps the footer inside the printable area
    // without spawning a page, then it's restored immediately after.
    const originalBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font("Body").fontSize(9).fillColor("gray").text(String(pageIndex + 1), 72, doc.page.height - 50, {
      align: "center",
      width: doc.page.width - 144,
      lineBreak: false,
    });
    doc.page.margins.bottom = originalBottomMargin;
    doc.fillColor("black");
  }
}
