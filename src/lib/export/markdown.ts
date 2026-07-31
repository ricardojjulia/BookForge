import { repairCommonMojibake } from "@/lib/text/repair-mojibake";

export type BookForExport = {
  title: string;
  author_name: string | null;
};

export type MatterSectionForExport = {
  section_type: string;
  title: string | null;
  content: string;
  sort_order: number | null;
};

export type ChapterForExport = {
  id: string;
  chapter_number: number;
  title: string | null;
};

export type ParagraphForExport = {
  id: string;
  chapter_id: string;
  scene_id: string | null;
  paragraph_number: number;
  original_text: string;
  current_text: string | null;
  accepted_text: string | null;
  is_locked: boolean | null;
};

export type FinalManuscriptSourceMode = "accepted" | "latest" | "original";

export type LatestDraftByParagraph = Record<string, string>;

export type BuildMarkdownInput = {
  book: BookForExport;
  chapters: ChapterForExport[];
  paragraphs: ParagraphForExport[];
  matterSections?: MatterSectionForExport[];
  latestDraftsByParagraph?: LatestDraftByParagraph;
  sourceMode: FinalManuscriptSourceMode;
  includeFrontMatter: boolean;
  includeBackMatter: boolean;
  useOriginalForLocked: boolean;
  abridgedMode?: boolean;
};

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

export function buildFinalManuscriptMarkdown(input: BuildMarkdownInput) {
  const lines: string[] = [];
  const sortedMatter = (input.matterSections || []).slice().sort((a, b) => {
    const sort = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (sort !== 0) return sort;
    return a.section_type.localeCompare(b.section_type);
  });

  lines.push(`# ${normalizeExportText(input.book.title.trim() || "Untitled Book")}`);
  if (input.book.author_name) {
    lines.push("", `by ${normalizeExportText(input.book.author_name)}`);
  }

  if (input.includeFrontMatter) {
    appendMatter(lines, sortedMatter.filter((section) => frontMatterTypes.has(section.section_type)));
  }

  const paragraphsByChapter = input.paragraphs.reduce<Record<string, ParagraphForExport[]>>((groups, paragraph) => {
    groups[paragraph.chapter_id] ||= [];
    groups[paragraph.chapter_id].push(paragraph);
    return groups;
  }, {});

  const visibleChapters = input.chapters.filter((chapter) =>
    input.paragraphs.some((paragraph) => paragraph.chapter_id === chapter.id),
  );

  visibleChapters.forEach((chapter) => {
    const chapterParagraphs = (paragraphsByChapter[chapter.id] || [])
      .slice()
      .sort((a, b) => a.paragraph_number - b.paragraph_number);
    if (!chapterParagraphs.length) return;

    lines.push("", `## ${chapter.title?.trim() || `Chapter ${chapter.chapter_number}`}`, "");

    let previousSceneId: string | null = null;
    chapterParagraphs.forEach((paragraph, index) => {
      if (index > 0 && paragraph.scene_id && previousSceneId && paragraph.scene_id !== previousSceneId) {
        lines.push("", "***", "");
      }
      lines.push(selectExportParagraphText(paragraph, input));
      previousSceneId = paragraph.scene_id;
      lines.push("");
    });
  });

  if (input.includeBackMatter) {
    appendMatter(lines, sortedMatter.filter((section) => backMatterTypes.has(section.section_type)));
  }

  return normalizeMarkdown(lines.join("\n"));
}

function appendMatter(lines: string[], sections: MatterSectionForExport[]) {
  sections.forEach((section) => {
    const title = normalizeExportText(section.title?.trim() || humanizeSectionType(section.section_type));
    lines.push("", `## ${title}`, "", normalizeExportText(section.content.trim()), "");
  });
}

export function selectExportParagraphText(
  paragraph: ParagraphForExport,
  input: {
    sourceMode: FinalManuscriptSourceMode;
    latestDraftsByParagraph?: LatestDraftByParagraph;
    useOriginalForLocked: boolean;
  },
) {
  if (input.useOriginalForLocked && paragraph.is_locked) {
    return normalizeExportText(paragraph.original_text);
  }

  if (input.sourceMode === "original") {
    return normalizeExportText(paragraph.original_text);
  }

  if (input.sourceMode === "latest") {
    return normalizeExportText(
      input.latestDraftsByParagraph?.[paragraph.id] ||
      paragraph.current_text ||
      paragraph.accepted_text ||
      paragraph.original_text,
    );
  }

  return normalizeExportText(paragraph.accepted_text || paragraph.original_text);
}

export function humanizeSectionType(sectionType: string) {
  return sectionType
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeMarkdown(markdown: string) {
  return markdown
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .concat("\n");
}

function normalizeExportText(text: string) {
  return repairCommonMojibake(text || "");
}
