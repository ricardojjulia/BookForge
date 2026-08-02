import { parseChapterScenes } from "@/lib/manuscript/parser";
import {
  buildBookForgePackage,
  type BookForgePackageEntry,
  type BookForgePackageManifest,
  type LogicalBookForgePackage,
  parseLogicalBookForgePackage,
} from "@/lib/bookforge-package";

type QueryResult<T> = Promise<{ data: T | null; error: unknown }>;

type SupabaseMutationBuilder = {
  select: (columns: string) => SupabaseMutationBuilder;
  single?: () => unknown;
  then?: (resolve: (value: { data?: unknown; error?: unknown }) => unknown) => unknown;
};

type SupabaseTableBuilder = {
  insert: (payload: unknown) => SupabaseMutationBuilder;
};

type SupabaseLike = {
  from: (table: string) => SupabaseTableBuilder;
};

export type DownloadPackageRows = {
  book: {
    id: string;
    title: string;
    author_name: string | null;
    status?: string | null;
  };
  chapters: Array<{
    id: string;
    chapter_number: number;
    title: string | null;
    summary?: string | null;
  }>;
  paragraphs: Array<{
    id: string;
    chapter_id: string;
    paragraph_number: number;
    original_text: string | null;
    current_text?: string | null;
    accepted_text?: string | null;
  }>;
  bookBible?: { content: unknown; updated_at?: string | null } | null;
  revisions?: Array<{
    id: string;
    paragraph_id: string | null;
    revised_text: string;
    revision_notes: string | null;
    accepted: boolean | null;
    rejected: boolean | null;
    created_at: string;
  }>;
};

export function buildCreativeWriterPackageFromRows(input: {
  rows: DownloadPackageRows;
  userId: string;
  packageId?: string;
  timestamp?: string;
  sourceMode?: "accepted" | "current" | "original";
}): LogicalBookForgePackage {
  const timestamp = input.timestamp || new Date().toISOString();
  const packageId = input.packageId || `cloud-${input.rows.book.id}`;
  const additionalEntries = buildCloudMetadataEntries(input.rows, input.userId, timestamp);

  return buildBookForgePackage({
    packageId,
    createdAt: timestamp,
    updatedAt: timestamp,
    mode: "cloud_linked",
    book: {
      id: input.rows.book.id,
      title: input.rows.book.title,
      author_name: input.rows.book.author_name,
      status: input.rows.book.status || "draft",
    },
    chapters: input.rows.chapters,
    paragraphs: input.rows.paragraphs,
    sourceMode: input.sourceMode || "accepted",
    cloud: {
      accountId: input.userId,
      bookId: input.rows.book.id,
      syncCursor: `book:${input.rows.book.id}:snapshot:${timestamp}`,
      lastCloudVersion: Math.floor(new Date(timestamp).getTime() / 1000),
      linkedAt: timestamp,
    },
    additionalEntries,
  });
}

export function parseCreativeWriterUploadPackage(pkg: LogicalBookForgePackage) {
  const parsed = parseLogicalBookForgePackage(pkg);
  const bookTitle = parsed.manifest.book.title.trim() || "Untitled Book";

  return {
    manifest: parsed.manifest,
    book: {
      title: bookTitle,
      authorName: parsed.manifest.book.authorName || null,
      status: parsed.manifest.book.status || "draft",
    },
    chapters: parsed.chapters.map((chapter) => {
      const chapterText = normalizeUploadedChapterText(chapter.bodyMarkdown, chapter.title);
      return {
        chapterNumber: chapter.chapterNumber,
        title: chapter.title,
        text: chapterText,
        scenes: parseChapterScenes(chapterText),
        packagePath: chapter.path,
        packageMetadata: chapter.metadata,
      };
    }),
    metadataEntries: parsed.metadata,
    bibleEntries: parsed.bible,
    noteEntries: parsed.notes,
    researchEntries: parsed.research,
  };
}

export async function insertCreativeWriterPackage(input: {
  supabase: SupabaseLike;
  userId: string;
  pkg: LogicalBookForgePackage;
  projectName?: string;
}): Promise<{ bookId: string; projectId: string; chapterCount: number; paragraphCount: number }> {
  const parsed = parseCreativeWriterUploadPackage(input.pkg);
  if (!parsed.chapters.length) {
    throw new Error("Package must include at least one manuscript chapter.");
  }

  const { data: project, error: projectError } = await resolveSingle<{ id: string }>(
    input.supabase
      .from("projects")
      .insert({
        owner_id: input.userId,
        name: input.projectName || `${parsed.book.title} Project`,
        description: "Imported from a BookForge CreativeWriter package.",
      })
      .select("id"),
  );
  if (projectError) throw projectError;
  if (!project?.id) throw new Error("Unable to create project for package import.");

  const { data: book, error: bookError } = await resolveSingle<{ id: string }>(
    input.supabase
      .from("books")
      .insert({
        project_id: project.id,
        owner_id: input.userId,
        title: parsed.book.title,
        author_name: parsed.book.authorName,
        status: parsed.book.status,
      })
      .select("id"),
  );
  if (bookError) throw bookError;
  if (!book?.id) throw new Error("Unable to create book for package import.");

  let paragraphCount = 0;
  for (const chapter of parsed.chapters.sort((a, b) => a.chapterNumber - b.chapterNumber)) {
    const { data: chapterRow, error: chapterError } = await resolveSingle<{ id: string }>(
      input.supabase
        .from("chapters")
        .insert({
          book_id: book.id,
          chapter_number: chapter.chapterNumber,
          title: chapter.title,
          original_text: chapter.text,
          current_text: chapter.text,
          summary: null,
          status: "pending",
        })
        .select("id"),
    );
    if (chapterError) throw chapterError;
    if (!chapterRow?.id) throw new Error(`Unable to create chapter ${chapter.chapterNumber}.`);

    for (const scene of chapter.scenes) {
      const { data: sceneRow, error: sceneError } = await resolveSingle<{ id: string }>(
        input.supabase
          .from("scenes")
          .insert({
            book_id: book.id,
            chapter_id: chapterRow.id,
            scene_number: scene.sceneNumber,
            original_text: scene.text,
            current_text: scene.text,
            status: "pending",
          })
          .select("id"),
      );
      if (sceneError) throw sceneError;
      if (!sceneRow?.id) throw new Error(`Unable to create scene ${scene.sceneNumber} for chapter ${chapter.chapterNumber}.`);

      const paragraphRows = scene.paragraphs.map((paragraph) => ({
        book_id: book.id,
        chapter_id: chapterRow.id,
        scene_id: sceneRow.id,
        paragraph_number: paragraph.paragraphNumber,
        original_text: paragraph.text,
        current_text: paragraph.text,
      }));
      paragraphCount += paragraphRows.length;

      if (paragraphRows.length) {
        const { error: paragraphError } = await resolveMutation(input.supabase.from("paragraphs").insert(paragraphRows));
        if (paragraphError) throw paragraphError;
      }
    }
  }

  const packageMetadata = buildPackageImportMetadata(input.pkg.manifest, parsed.metadataEntries, parsed.bibleEntries);
  const { error: reportError } = await resolveMutation(
    input.supabase.from("coherence_reports").insert({
      book_id: book.id,
      report_type: "creativewriter_package_import",
      content: packageMetadata,
    }),
  );
  if (reportError) throw reportError;

  return {
    bookId: book.id,
    projectId: project.id,
    chapterCount: parsed.chapters.length,
    paragraphCount,
  };
}

function buildCloudMetadataEntries(rows: DownloadPackageRows, userId: string, timestamp: string): BookForgePackageEntry[] {
  const entries: BookForgePackageEntry[] = [
    {
      path: "metadata/sync.json",
      kind: "metadata",
      content: JSON.stringify(
        {
          formatVersion: "1",
          mode: "cloud_linked",
          accountId: userId,
          bookId: rows.book.id,
          exportedAt: timestamp,
        },
        null,
        2,
      ).concat("\n"),
    },
    {
      path: "metadata/revisions.json",
      kind: "metadata",
      content: JSON.stringify({ formatVersion: "1", revisions: rows.revisions || [] }, null, 2).concat("\n"),
    },
  ];

  if (rows.bookBible) {
    entries.push({
      path: "metadata/book-bible.json",
      kind: "metadata",
      content: JSON.stringify({ formatVersion: "1", bookBible: rows.bookBible }, null, 2).concat("\n"),
    });
  }

  return entries;
}

function normalizeUploadedChapterText(markdown: string, title: string) {
  const withoutLeadingTitle = markdown.replace(new RegExp(`^#\\s+${escapeRegExp(title)}\\s*\\n+`, "i"), "");
  return withoutLeadingTitle.trim() || markdown.trim();
}

function buildPackageImportMetadata(
  manifest: BookForgePackageManifest,
  metadataEntries: BookForgePackageEntry[],
  bibleEntries: BookForgePackageEntry[],
) {
  return {
    packageId: manifest.packageId,
    packageFormatVersion: manifest.formatVersion,
    packageMode: manifest.mode,
    importedAt: new Date().toISOString(),
    sourceCloudBookId: manifest.cloud?.bookId || manifest.book.bookforgeBookId || null,
    metadataEntryPaths: metadataEntries.map((entry) => entry.path),
    bibleEntryPaths: bibleEntries.map((entry) => entry.path),
  };
}

async function resolveSingle<T>(builder: SupabaseMutationBuilder): QueryResult<T> {
  if (typeof builder.single === "function") {
    const result = await (builder.single() as Promise<{ data?: unknown; error?: unknown }>);
    return { data: (result.data as T | null) ?? null, error: result.error };
  }
  const result = await (builder as unknown as Promise<{ data: T | null; error: unknown }>);
  return { data: result?.data ?? null, error: result?.error ?? null };
}

async function resolveMutation(builder: SupabaseMutationBuilder): Promise<{ error: unknown }> {
  const result = await (builder as unknown as Promise<{ error: unknown }>);
  return { error: result?.error ?? null };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
