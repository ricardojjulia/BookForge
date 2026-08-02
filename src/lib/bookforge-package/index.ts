import { z } from "zod";

export const bookForgePackageFormatVersion = "1" as const;

export const bookForgePackageModeSchema = z.enum(["local_only", "cloud_linked"]);
export type BookForgePackageMode = z.infer<typeof bookForgePackageModeSchema>;

export const bookForgePackageEntryKindSchema = z.enum([
  "manifest",
  "manuscript",
  "note",
  "research",
  "bible",
  "metadata",
  "export",
]);
export type BookForgePackageEntryKind = z.infer<typeof bookForgePackageEntryKindSchema>;

export const bookForgePackageManifestSchema = z
  .object({
    formatVersion: z.literal(bookForgePackageFormatVersion),
    packageId: z.string().min(1),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    mode: bookForgePackageModeSchema,
    book: z.object({
      title: z.string().min(1),
      bookforgeBookId: z.string().min(1).optional(),
      authorName: z.string().nullable().optional(),
      language: z.string().min(1).optional(),
      status: z.string().min(1).optional(),
    }),
    cloud: z
      .object({
        accountId: z.string().min(1),
        bookId: z.string().min(1),
        syncCursor: z.string().optional(),
        lastCloudVersion: z.number().int().nonnegative().optional(),
        linkedAt: z.string().min(1).optional(),
      })
      .optional(),
  })
  .superRefine((manifest, ctx) => {
    if (manifest.mode === "cloud_linked" && !manifest.cloud) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cloud"],
        message: "cloud_linked packages require cloud identity metadata.",
      });
    }

    if (manifest.cloud && manifest.book.bookforgeBookId && manifest.cloud.bookId !== manifest.book.bookforgeBookId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cloud", "bookId"],
        message: "cloud.bookId must match book.bookforgeBookId when both are present.",
      });
    }
  });

export type BookForgePackageManifest = z.infer<typeof bookForgePackageManifestSchema>;

export const bookForgePackageEntrySchema = z.object({
  path: z.string().min(1).refine(isSafePackagePath, "Package paths must be relative and must not contain '..'."),
  kind: bookForgePackageEntryKindSchema,
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type BookForgePackageEntry = z.infer<typeof bookForgePackageEntrySchema>;

export const logicalBookForgePackageSchema = z.object({
  manifest: bookForgePackageManifestSchema,
  entries: z.array(bookForgePackageEntrySchema).min(1),
});
export type LogicalBookForgePackage = z.infer<typeof logicalBookForgePackageSchema>;

export type BookForgePackageBookInput = {
  id?: string | null;
  title: string;
  author_name?: string | null;
  language?: string | null;
  status?: string | null;
};

export type BookForgePackageChapterInput = {
  id: string;
  chapter_number: number;
  title: string | null;
  summary?: string | null;
};

export type BookForgePackageParagraphInput = {
  id: string;
  chapter_id: string;
  paragraph_number: number;
  original_text: string | null;
  current_text?: string | null;
  accepted_text?: string | null;
};

export type BuildBookForgePackageInput = {
  packageId: string;
  createdAt: string;
  updatedAt: string;
  mode?: BookForgePackageMode;
  book: BookForgePackageBookInput;
  chapters: BookForgePackageChapterInput[];
  paragraphs: BookForgePackageParagraphInput[];
  cloud?: BookForgePackageManifest["cloud"];
  sourceMode?: "accepted" | "current" | "original";
  additionalEntries?: BookForgePackageEntry[];
};

export type ImportedBookForgeChapter = {
  path: string;
  chapterNumber: number;
  title: string;
  bodyMarkdown: string;
  frontmatter: string | null;
  metadata: Record<string, unknown>;
};

export type ParsedBookForgePackage = {
  manifest: BookForgePackageManifest;
  chapters: ImportedBookForgeChapter[];
  notes: BookForgePackageEntry[];
  research: BookForgePackageEntry[];
  bible: BookForgePackageEntry[];
  metadata: BookForgePackageEntry[];
};

export function buildBookForgePackage(input: BuildBookForgePackageInput): LogicalBookForgePackage {
  const manifest: BookForgePackageManifest = {
    formatVersion: bookForgePackageFormatVersion,
    packageId: input.packageId,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    mode: input.mode || (input.cloud ? "cloud_linked" : "local_only"),
    book: {
      title: input.book.title.trim() || "Untitled Book",
      ...(input.book.id ? { bookforgeBookId: input.book.id } : {}),
      ...(input.book.author_name !== undefined ? { authorName: input.book.author_name } : {}),
      ...(input.book.language ? { language: input.book.language } : {}),
      ...(input.book.status ? { status: input.book.status } : {}),
    },
    ...(input.cloud ? { cloud: input.cloud } : {}),
  };

  const entries: BookForgePackageEntry[] = [
    {
      path: "bookforge.yml",
      kind: "manifest",
      content: renderManifestYaml(manifest),
    },
    ...buildManuscriptEntries(input),
    {
      path: "metadata/outline.json",
      kind: "metadata",
      content: JSON.stringify(buildOutlineMetadata(input.chapters), null, 2).concat("\n"),
    },
    ...(input.additionalEntries || []),
  ];

  return logicalBookForgePackageSchema.parse({ manifest, entries });
}

export function buildChapterFilename(chapter: Pick<BookForgePackageChapterInput, "chapter_number" | "title">): string {
  const number = Math.max(0, Math.trunc(chapter.chapter_number || 0)).toString().padStart(3, "0");
  const fallback = `chapter-${Math.max(1, Math.trunc(chapter.chapter_number || 1))}`;
  const slug = slugify(chapter.title || "") || fallback;
  return `${number}-${slug}.md`;
}

export function parseLogicalBookForgePackage(pkg: LogicalBookForgePackage): ParsedBookForgePackage {
  const parsed = logicalBookForgePackageSchema.parse(pkg);
  const manuscriptEntries = parsed.entries
    .filter((entry) => entry.kind === "manuscript")
    .slice()
    .sort((a, b) => comparePackagePaths(a.path, b.path));

  return {
    manifest: parsed.manifest,
    chapters: manuscriptEntries.map(parseManuscriptEntry),
    notes: parsed.entries.filter((entry) => entry.kind === "note"),
    research: parsed.entries.filter((entry) => entry.kind === "research"),
    bible: parsed.entries.filter((entry) => entry.kind === "bible"),
    metadata: parsed.entries.filter((entry) => entry.kind === "metadata"),
  };
}

export function isSafePackagePath(path: string): boolean {
  if (!path || path.startsWith("/") || path.includes("\\")) return false;
  return !path.split("/").some((part) => part === "" || part === "." || part === "..");
}

function buildManuscriptEntries(input: BuildBookForgePackageInput): BookForgePackageEntry[] {
  const paragraphsByChapter = input.paragraphs.reduce<Record<string, BookForgePackageParagraphInput[]>>((groups, paragraph) => {
    groups[paragraph.chapter_id] ||= [];
    groups[paragraph.chapter_id].push(paragraph);
    return groups;
  }, {});

  return input.chapters
    .slice()
    .sort((a, b) => a.chapter_number - b.chapter_number)
    .map((chapter) => {
      const paragraphs = (paragraphsByChapter[chapter.id] || []).slice().sort((a, b) => a.paragraph_number - b.paragraph_number);
      const title = chapter.title?.trim() || `Chapter ${chapter.chapter_number}`;
      const body = paragraphs.map((paragraph) => selectParagraphText(paragraph, input.sourceMode || "accepted")).filter(Boolean).join("\n\n");

      return {
        path: `manuscript/${buildChapterFilename(chapter)}`,
        kind: "manuscript" as const,
        content: renderChapterMarkdown({ chapter, title, body }),
        metadata: {
          chapterId: chapter.id,
          chapterNumber: chapter.chapter_number,
          paragraphCount: paragraphs.length,
        },
      };
    });
}

function selectParagraphText(paragraph: BookForgePackageParagraphInput, sourceMode: NonNullable<BuildBookForgePackageInput["sourceMode"]>): string {
  if (sourceMode === "original") return paragraph.original_text || "";
  if (sourceMode === "current") return paragraph.current_text || paragraph.accepted_text || paragraph.original_text || "";
  return paragraph.accepted_text || paragraph.original_text || "";
}

function renderChapterMarkdown(input: { chapter: BookForgePackageChapterInput; title: string; body: string }): string {
  const frontmatter = [
    "---",
    `bookforgeChapterId: ${JSON.stringify(input.chapter.id)}`,
    `chapterNumber: ${input.chapter.chapter_number}`,
    `title: ${JSON.stringify(input.title)}`,
    ...(input.chapter.summary ? [`summary: ${JSON.stringify(input.chapter.summary)}`] : []),
    "---",
  ];

  return [...frontmatter, "", `# ${input.title}`, "", input.body.trim()].join("\n").trim().concat("\n");
}

function parseManuscriptEntry(entry: BookForgePackageEntry): ImportedBookForgeChapter {
  const { frontmatter, body } = splitFrontmatter(entry.content);
  const numberFromPath = Number(entry.path.match(/(?:^|\/)(\d+)-/)?.[1] || 0);
  const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const title = String(entry.metadata?.title || heading || titleFromPath(entry.path) || `Chapter ${numberFromPath || 1}`);

  return {
    path: entry.path,
    chapterNumber: Number(entry.metadata?.chapterNumber || numberFromPath || 1),
    title,
    bodyMarkdown: body.trim(),
    frontmatter,
    metadata: entry.metadata || {},
  };
}

function splitFrontmatter(content: string): { frontmatter: string | null; body: string } {
  if (!content.startsWith("---\n")) return { frontmatter: null, body: content };
  const end = content.indexOf("\n---", 4);
  if (end < 0) return { frontmatter: null, body: content };
  const afterEnd = content.indexOf("\n", end + 4);
  return {
    frontmatter: content.slice(4, end).trim(),
    body: afterEnd >= 0 ? content.slice(afterEnd + 1) : "",
  };
}

function titleFromPath(path: string): string {
  const file = path.split("/").pop()?.replace(/\.md$/i, "") || "";
  return file
    .replace(/^\d+-/, "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function comparePackagePaths(a: string, b: string): number {
  const aNumber = Number(a.match(/(?:^|\/)(\d+)-/)?.[1] || Number.MAX_SAFE_INTEGER);
  const bNumber = Number(b.match(/(?:^|\/)(\d+)-/)?.[1] || Number.MAX_SAFE_INTEGER);
  return aNumber - bNumber || a.localeCompare(b);
}

function buildOutlineMetadata(chapters: BookForgePackageChapterInput[]) {
  return {
    formatVersion: bookForgePackageFormatVersion,
    chapters: chapters
      .slice()
      .sort((a, b) => a.chapter_number - b.chapter_number)
      .map((chapter) => ({
        id: chapter.id,
        chapterNumber: chapter.chapter_number,
        title: chapter.title || `Chapter ${chapter.chapter_number}`,
        summary: chapter.summary || null,
      })),
  };
}

function renderManifestYaml(manifest: BookForgePackageManifest): string {
  const lines = [
    `formatVersion: ${JSON.stringify(manifest.formatVersion)}`,
    `packageId: ${JSON.stringify(manifest.packageId)}`,
    `createdAt: ${JSON.stringify(manifest.createdAt)}`,
    `updatedAt: ${JSON.stringify(manifest.updatedAt)}`,
    `mode: ${JSON.stringify(manifest.mode)}`,
    "book:",
    `  title: ${JSON.stringify(manifest.book.title)}`,
  ];

  if (manifest.book.bookforgeBookId) lines.push(`  bookforgeBookId: ${JSON.stringify(manifest.book.bookforgeBookId)}`);
  if (manifest.book.authorName !== undefined) lines.push(`  authorName: ${JSON.stringify(manifest.book.authorName)}`);
  if (manifest.book.language) lines.push(`  language: ${JSON.stringify(manifest.book.language)}`);
  if (manifest.book.status) lines.push(`  status: ${JSON.stringify(manifest.book.status)}`);

  if (manifest.cloud) {
    lines.push("cloud:", `  accountId: ${JSON.stringify(manifest.cloud.accountId)}`, `  bookId: ${JSON.stringify(manifest.cloud.bookId)}`);
    if (manifest.cloud.syncCursor) lines.push(`  syncCursor: ${JSON.stringify(manifest.cloud.syncCursor)}`);
    if (manifest.cloud.lastCloudVersion !== undefined) lines.push(`  lastCloudVersion: ${manifest.cloud.lastCloudVersion}`);
    if (manifest.cloud.linkedAt) lines.push(`  linkedAt: ${JSON.stringify(manifest.cloud.linkedAt)}`);
  }

  return lines.join("\n").concat("\n");
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}
