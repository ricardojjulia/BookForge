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
// that range silently renders as a missing-glyph box. Open Sans covers full
// Latin Extended, Cyrillic, Greek, Vietnamese, and Hebrew (verified via
// fontkit), so it's the default. Manuscripts containing Arabic or CJK
// characters switch to a Noto Sans variant instead -- no single font covers
// every script, and Noto Sans SC in particular is ~10MB per weight (tens of
// thousands of CJK glyphs), so it's read from disk only when a manuscript
// actually contains CJK text rather than unconditionally on every export.
// Note also that pdfkit does not reorder text for right-to-left scripts or
// apply Arabic's positional letterforms on its own, so Arabic/Hebrew
// glyphs will render but correct shaping/reading order is a separate,
// still-open problem -- not a font-coverage one.
function loadFontPair(regularFile: string, boldFile: string) {
  return {
    regular: readFileSync(join(process.cwd(), "src/lib/export/fonts", regularFile)),
    bold: readFileSync(join(process.cwd(), "src/lib/export/fonts", boldFile)),
  };
}

const LATIN_FONT = loadFontPair("OpenSans-Regular.ttf", "OpenSans-Bold.ttf");
let arabicFont: { regular: Buffer; bold: Buffer } | null = null;
let cjkFont: { regular: Buffer; bold: Buffer } | null = null;

// Unicode block ranges, not literal glyphs, so the boundaries stay auditable.
const ARABIC_SCRIPT_PATTERN = /[\u{0600}-\u{06FF}\u{0750}-\u{077F}\u{08A0}-\u{08FF}\u{FB50}-\u{FDFF}\u{FE70}-\u{FEFF}]/u;
const CJK_SCRIPT_PATTERN = /[\u{3000}-\u{303F}\u{3400}-\u{4DBF}\u{4E00}-\u{9FFF}\u{F900}-\u{FAFF}\u{FF00}-\u{FFEF}]/u;

function detectBodyFont(sampleText: string) {
  if (ARABIC_SCRIPT_PATTERN.test(sampleText)) {
    arabicFont ??= loadFontPair("NotoSansArabic-Regular.ttf", "NotoSansArabic-Bold.ttf");
    return arabicFont;
  }
  if (CJK_SCRIPT_PATTERN.test(sampleText)) {
    cjkFont ??= loadFontPair("NotoSansSC-Regular.ttf", "NotoSansSC-Bold.ttf");
    return cjkFont;
  }
  return LATIN_FONT;
}

function registerBodyFonts(doc: PDFKit.PDFDocument, sampleText: string) {
  const font = detectBodyFont(sampleText);
  doc.registerFont("Body", font.regular);
  doc.registerFont("Body-Bold", font.bold);
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
  // A handful of paragraphs is enough to detect the manuscript's dominant
  // script -- books are written in one language/script throughout, so this
  // avoids reading every paragraph just to pick a font.
  const scriptSample = [input.book.title, ...input.paragraphs.slice(0, 10).map((p) => p.original_text)].join(" ");
  registerBodyFonts(doc, scriptSample);

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
