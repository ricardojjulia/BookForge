import PDFDocument from "pdfkit";
import {
  humanizeSectionType,
  selectExportParagraphText,
  type BuildMarkdownInput,
  type MatterSectionForExport,
  type ParagraphForExport,
} from "@/lib/export/markdown";

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
    Title: input.book.title || "Untitled Book",
    Creator: "BookForge AI",
    Producer: "BookForge AI",
  };
  if (input.book.author_name?.trim()) {
    metadata.Author = input.book.author_name.trim();
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

  doc.addPage();
  doc.font("Helvetica-Bold").fontSize(24).text(input.book.title.trim() || "Untitled Book", {
    align: "center",
  });
  if (input.book.author_name) {
    doc.moveDown(0.75).font("Helvetica").fontSize(13).text(`by ${input.book.author_name}`, { align: "center" });
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

    addHeading(doc, chapter.title?.trim() || `Chapter ${chapter.chapter_number}`);

    let previousSceneId: string | null = null;
    chapterParagraphs.forEach((paragraph, index) => {
      if (index > 0 && paragraph.scene_id && previousSceneId && paragraph.scene_id !== previousSceneId) {
        doc.moveDown(0.75).font("Helvetica").fontSize(12).text("***", { align: "center" }).moveDown(0.75);
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
    appendBodyText(doc, section.content, options);
  });
}

function addHeading(doc: PDFKit.PDFDocument, title: string) {
  doc.addPage();
  doc.font("Helvetica-Bold").fontSize(18).text(title, { align: "center" });
  doc.moveDown(1);
}

function appendBodyText(doc: PDFKit.PDFDocument, text: string, options: { fontSize: number; lineGap?: number }) {
  text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .forEach((paragraph) => {
      doc.font("Helvetica").fontSize(options.fontSize).text(paragraph, {
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
    doc.font("Helvetica").fontSize(9).fillColor("gray").text(String(pageIndex + 1), 72, doc.page.height - 50, {
      align: "center",
      width: doc.page.width - 144,
    });
    doc.fillColor("black");
  }
}
