export type StructureAuditChapter = {
  id: string;
  chapter_number: number;
  title: string | null;
  original_text?: string | null;
  status?: string | null;
  section_type?: string | null;
  exclude_from_rewrite?: boolean | null;
  exclude_from_export?: boolean | null;
  structure_notes?: string | null;
};

export type StructureAuditParagraph = {
  id: string;
  chapter_id: string;
  paragraph_number: number;
  original_text: string;
};

export type StructureIssue = {
  id: string;
  severity: "low" | "medium" | "high";
  title: string;
  description: string;
  chapterId?: string;
  chapterNumber?: number;
};

export function auditBookStructure(chapters: StructureAuditChapter[], paragraphs: StructureAuditParagraph[]) {
  const issues: StructureIssue[] = [];
  const paragraphsByChapter = paragraphs.reduce<Record<string, StructureAuditParagraph[]>>((groups, paragraph) => {
    groups[paragraph.chapter_id] ||= [];
    groups[paragraph.chapter_id].push(paragraph);
    return groups;
  }, {});
  const paragraphCounts = chapters.map((chapter) => ({
    chapter,
    count: paragraphsByChapter[chapter.id]?.length || 0,
  }));
  const nonEmptyCounts = paragraphCounts.map((item) => item.count).filter((count) => count > 0);
  const averageParagraphs =
    nonEmptyCounts.length > 0 ? nonEmptyCounts.reduce((sum, count) => sum + count, 0) / nonEmptyCounts.length : 0;
  const titleGroups = new Map<string, StructureAuditChapter[]>();

  chapters.forEach((chapter) => {
    const normalizedTitle = normalizeTitle(chapter.title);
    if (normalizedTitle) {
      titleGroups.set(normalizedTitle, [...(titleGroups.get(normalizedTitle) || []), chapter]);
    }

    const chapterParagraphs = paragraphsByChapter[chapter.id] || [];
    const wordCount = chapterParagraphs.reduce((sum, paragraph) => sum + countWords(paragraph.original_text), 0);
    const titleLooksLikeMatter = looksLikeFrontMatter(chapter.title);

    const isPlannedCreationShell =
      chapter.status === "planned" ||
      /Draft text has not been generated yet\. This planned chapter shell was created from BookForge Creator architecture\./i.test(
        chapter.original_text || "",
      );

    if ((chapterParagraphs.length === 0 || wordCount < 20) && isPlannedCreationShell) {
      issues.push({
        id: `planned-${chapter.id}`,
        severity: "low",
        title: "Planned chapter awaiting generated draft",
        description:
          "This chapter was created from the BookForge Creator architecture. It is expected to stay short until you run Generate Planned Draft.",
        chapterId: chapter.id,
        chapterNumber: chapter.chapter_number,
      });
    } else if (chapterParagraphs.length === 0 || wordCount < 20) {
      issues.push({
        id: `empty-${chapter.id}`,
        severity: "high",
        title: "Empty or title-only chapter",
        description: "This chapter has very little body text and may be front matter, a duplicate heading, or a parsing artifact.",
        chapterId: chapter.id,
        chapterNumber: chapter.chapter_number,
      });
    } else if (titleLooksLikeMatter && chapter.section_type === "body") {
      issues.push({
        id: `matter-${chapter.id}`,
        severity: "medium",
        title: "Possible front/back matter in body",
        description: "This chapter title looks like title page, copyright, dedication, introduction, appendix, or other matter. Consider changing its section type.",
        chapterId: chapter.id,
        chapterNumber: chapter.chapter_number,
      });
    } else if (chapterParagraphs.length <= 2 || wordCount < 120) {
      issues.push({
        id: `short-${chapter.id}`,
        severity: "medium",
        title: "Very short chapter",
        description: "This chapter is unusually short. Check whether it should be merged with a neighboring chapter.",
        chapterId: chapter.id,
        chapterNumber: chapter.chapter_number,
      });
    }

    if (averageParagraphs > 0 && chapterParagraphs.length > Math.max(40, averageParagraphs * 2.5)) {
      issues.push({
        id: `long-${chapter.id}`,
        severity: "medium",
        title: "Unusually long chapter",
        description: "This chapter is much longer than the surrounding structure. It may need to be split.",
        chapterId: chapter.id,
        chapterNumber: chapter.chapter_number,
      });
    }
  });

  titleGroups.forEach((group) => {
    if (group.length < 2) return;
    issues.push({
      id: `repeat-title-${group.map((chapter) => chapter.id).join("-")}`,
      severity: "high",
      title: "Repeated chapter title",
      description: `The title "${group[0].title || "Untitled"}" appears ${group.length} times. This often indicates duplicated front matter or bad EPUB section detection.`,
      chapterId: group[0].id,
      chapterNumber: group[0].chapter_number,
    });
  });

  const duplicateSequence = findDuplicateTitleSequence(chapters);
  if (duplicateSequence) {
    issues.push({
      id: "duplicate-sequence",
      severity: "high",
      title: "Possible duplicated chapter sequence",
      description: `A repeated chapter-title sequence appears to start around chapter ${duplicateSequence.firstStart} and chapter ${duplicateSequence.secondStart}.`,
      chapterNumber: duplicateSequence.secondStart,
    });
  }

  return issues.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

function normalizeTitle(title: string | null) {
  return (title || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function severityRank(severity: StructureIssue["severity"]) {
  if (severity === "high") return 3;
  if (severity === "medium") return 2;
  return 1;
}

function findDuplicateTitleSequence(chapters: StructureAuditChapter[]) {
  const titles = chapters.map((chapter) => normalizeTitle(chapter.title));
  for (let length = Math.min(8, Math.floor(titles.length / 2)); length >= 3; length -= 1) {
    for (let first = 0; first <= titles.length - length * 2; first += 1) {
      const firstSequence = titles.slice(first, first + length).join("|");
      for (let second = first + length; second <= titles.length - length; second += 1) {
        if (firstSequence && firstSequence === titles.slice(second, second + length).join("|")) {
          return {
            firstStart: chapters[first].chapter_number,
            secondStart: chapters[second].chapter_number,
          };
        }
      }
    }
  }
  return null;
}

function looksLikeFrontMatter(title: string | null) {
  const normalized = normalizeTitle(title);
  return /\b(title|copyright|dedication|acknowledg|foreword|preface|introduction|prologo|prólogo|indice|índice|contents|toc|appendix|bibliography|glossary|about the author|author bio)\b/.test(
    normalized,
  );
}
