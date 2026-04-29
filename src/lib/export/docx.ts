import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
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

export async function buildFinalManuscriptDocx(input: BuildMarkdownInput) {
  const children: Paragraph[] = [
    new Paragraph({
      text: input.book.title.trim() || "Untitled Book",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
    }),
  ];

  if (input.book.author_name) {
    children.push(
      new Paragraph({
        text: `by ${input.book.author_name}`,
        alignment: AlignmentType.CENTER,
        spacing: { after: 480 },
      }),
    );
  }

  const sortedMatter = (input.matterSections || []).slice().sort((a, b) => {
    const sort = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (sort !== 0) return sort;
    return a.section_type.localeCompare(b.section_type);
  });

  if (input.includeFrontMatter) {
    appendMatter(children, sortedMatter.filter((section) => frontMatterTypes.has(section.section_type)));
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

    children.push(
      new Paragraph({
        text: chapter.title?.trim() || `Chapter ${chapter.chapter_number}`,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 480, after: 240 },
      }),
    );

    let previousSceneId: string | null = null;
    chapterParagraphs.forEach((paragraph, index) => {
      if (index > 0 && paragraph.scene_id && previousSceneId && paragraph.scene_id !== previousSceneId) {
        children.push(
          new Paragraph({
            text: "***",
            alignment: AlignmentType.CENTER,
            spacing: { before: 240, after: 240 },
          }),
        );
      }

      appendBodyText(children, selectExportParagraphText(paragraph, input));
      previousSceneId = paragraph.scene_id;
    });
  });

  if (input.includeBackMatter) {
    appendMatter(children, sortedMatter.filter((section) => backMatterTypes.has(section.section_type)));
  }

  const document = new Document({
    creator: "BookForge AI",
    title: input.book.title,
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  return Packer.toBuffer(document);
}

function appendMatter(children: Paragraph[], sections: MatterSectionForExport[]) {
  sections.forEach((section) => {
    children.push(
      new Paragraph({
        text: section.title?.trim() || humanizeSectionType(section.section_type),
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 480, after: 240 },
      }),
    );
    appendBodyText(children, section.content);
  });
}

function appendBodyText(children: Paragraph[], text: string) {
  text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .forEach((paragraph) => {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: paragraph })],
          spacing: { after: 220 },
        }),
      );
    });
}
