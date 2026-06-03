import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type BookRow = {
  id: string;
  title: string;
  author_name: string | null;
};

type ChapterRow = {
  id: string;
  chapter_number: number;
  title: string | null;
  summary: string | null;
};

type MatterRow = {
  id: string;
  section_type: string;
  title: string | null;
  content: string;
  sort_order: number | null;
};

type ExportRow = {
  id: string;
  format: string;
  storage_path: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export function buildCourseLessonDrafts(chapters: ChapterRow[], moduleIdByChapterId: Map<string, string>) {
  return chapters
    .filter((chapter) => chapter.summary && chapter.summary.trim().length)
    .map((chapter) => ({
      module_id: moduleIdByChapterId.get(chapter.id) || "",
      title: `${chapter.title || `Chapter ${chapter.chapter_number}`} Summary`,
      lesson_type: "chapter_summary" as const,
      lesson_order: 1,
      content: chapter.summary || "",
      source_chapter_id: chapter.id,
      metadata: {
        chapterNumber: chapter.chapter_number,
      },
    }))
    .filter((lesson) => Boolean(lesson.module_id));
}

export function buildCourseAssetDrafts(input: {
  courseId: string;
  matterSections: MatterRow[];
  exports: ExportRow[];
  chapters: ChapterRow[];
}) {
  const chapterById = new Map(input.chapters.map((chapter) => [chapter.id, chapter]));

  const exportAssets = input.exports.map((row) => ({
    course_id: input.courseId,
    asset_type: "book_export" as const,
    title: `Export · ${row.format.toUpperCase()} · ${new Date(row.created_at).toLocaleDateString()}`,
    content_text: null as string | null,
    source_export_id: row.id,
    source_chapter_id: null as string | null,
    metadata: {
      format: row.format,
      storagePath: row.storage_path,
      ...(row.metadata || {}),
    },
  }));

  const matterAssets = input.matterSections
    .filter((row) => row.content.trim().length)
    .map((row) => ({
      course_id: input.courseId,
      asset_type: "matter_section" as const,
      title: row.title || row.section_type,
      content_text: row.content,
      source_export_id: null as string | null,
      source_chapter_id: null as string | null,
      metadata: {
        sectionType: row.section_type,
        sortOrder: row.sort_order,
      },
    }));

  const summaryAssets = input.chapters
    .filter((chapter) => chapter.summary && chapter.summary.trim().length)
    .map((chapter) => ({
      course_id: input.courseId,
      asset_type: "chapter_summary" as const,
      title: `${chapter.title || `Chapter ${chapter.chapter_number}`} Summary`,
      content_text: chapter.summary || "",
      source_export_id: null as string | null,
      source_chapter_id: chapter.id,
      metadata: {
        chapterNumber: chapter.chapter_number,
        chapterTitle: chapterById.get(chapter.id)?.title || null,
      },
    }));

  return [...exportAssets, ...matterAssets, ...summaryAssets];
}

export async function publishBookToCourseAssets(supabase: SupabaseClient, bookId: string, ownerId: string) {
  const [bookResponse, chaptersResponse, matterResponse, exportsResponse] = await Promise.all([
    supabase.from("books").select("id,title,author_name").eq("id", bookId).single(),
    supabase.from("chapters").select("id,chapter_number,title,summary").eq("book_id", bookId).order("chapter_number"),
    supabase.from("book_matter_sections").select("id,section_type,title,content,sort_order").eq("book_id", bookId).order("sort_order"),
    supabase
      .from("exports")
      .select("id,format,storage_path,metadata,created_at")
      .eq("book_id", bookId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (bookResponse.error) throw bookResponse.error;
  if (chaptersResponse.error) throw chaptersResponse.error;
  if (matterResponse.error) throw matterResponse.error;
  if (exportsResponse.error) throw exportsResponse.error;

  const book = bookResponse.data as BookRow;
  const chapters = (chaptersResponse.data || []) as ChapterRow[];
  const matterSections = (matterResponse.data || []) as MatterRow[];
  const exports = (exportsResponse.data || []) as ExportRow[];

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .upsert(
      {
        source_book_id: book.id,
        owner_id: ownerId,
        title: `${book.title} Course`,
        description: `Course assets generated from the manuscript \"${book.title}\".`,
        status: "draft",
        metadata: {
          authorName: book.author_name,
          generatedFromBookId: book.id,
          generatedAt: new Date().toISOString(),
        },
      },
      { onConflict: "source_book_id" },
    )
    .select("id")
    .single();
  if (courseError) throw courseError;

  const courseId = course.id as string;

  await supabase.from("course_assets").delete().eq("course_id", courseId);
  await supabase.from("course_lessons").delete().eq("course_id", courseId);
  await supabase.from("course_modules").delete().eq("course_id", courseId);

  const moduleInserts = chapters.map((chapter, index) => ({
    course_id: courseId,
    title: chapter.title || `Chapter ${chapter.chapter_number}`,
    module_order: index + 1,
    source_chapter_id: chapter.id,
    metadata: {
      chapterNumber: chapter.chapter_number,
    },
  }));

  const moduleIdByChapterId = new Map<string, string>();
  if (moduleInserts.length) {
    const { data: insertedModules, error: modulesError } = await supabase
      .from("course_modules")
      .insert(moduleInserts)
      .select("id,source_chapter_id");
    if (modulesError) throw modulesError;

    for (const row of insertedModules || []) {
      if (row.source_chapter_id) moduleIdByChapterId.set(String(row.source_chapter_id), String(row.id));
    }
  }

  const lessonInserts = buildCourseLessonDrafts(chapters, moduleIdByChapterId).map((lesson) => ({
    ...lesson,
    course_id: courseId,
  }));

  if (lessonInserts.length) {
    const { error: lessonsError } = await supabase.from("course_lessons").insert(lessonInserts);
    if (lessonsError) throw lessonsError;
  }

  const assetInserts = buildCourseAssetDrafts({
    courseId,
    chapters,
    matterSections,
    exports,
  });

  if (assetInserts.length) {
    const { error: assetsError } = await supabase.from("course_assets").insert(assetInserts);
    if (assetsError) throw assetsError;
  }

  return {
    courseId,
    modulesPublished: moduleInserts.length,
    lessonsPublished: lessonInserts.length,
    assetsPublished: assetInserts.length,
  };
}
