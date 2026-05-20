import { NextResponse } from "next/server";
import { extractTextFromFile, parseManuscript } from "@/lib/manuscript/parser";
import { createClient } from "@/lib/supabase/server";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Import failed.";
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const pastedText = String(formData.get("text") || "");
    const title = String(formData.get("title") || "Untitled Book");
    const authorName = String(formData.get("authorName") || "");
    const genre = String(formData.get("genre") || "");
    const targetAudience = String(formData.get("targetAudience") || "");
    const pointOfView = String(formData.get("pointOfView") || "");
    const tense = String(formData.get("tense") || "");

    const originalText =
      file instanceof File && file.size > 0 ? await extractTextFromFile(file) : pastedText.trim();

    if (!originalText) {
      return NextResponse.json({ error: "Upload a manuscript file or paste manuscript text." }, { status: 400 });
    }

    const parsed = parseManuscript(originalText, title);
    let originalFilePath: string | null = null;

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .insert({ owner_id: user.id, name: `${title} Project` })
      .select("id")
      .single();

    if (projectError) throw projectError;

    if (file instanceof File && file.size > 0) {
      originalFilePath = `${user.id}/${project.id}/${Date.now()}-${sanitizeStorageFileName(file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from("manuscripts")
        .upload(originalFilePath, file, { upsert: false });
      if (uploadError) throw uploadError;
    }

    const { data: book, error: bookError } = await supabase
      .from("books")
      .insert({
        project_id: project.id,
        owner_id: user.id,
        title,
        author_name: authorName,
        genre,
        target_audience: targetAudience,
        point_of_view: pointOfView,
        tense,
        original_file_path: originalFilePath,
      })
      .select("id")
      .single();

    if (bookError) throw bookError;

    for (const chapter of parsed.chapters) {
      const { data: chapterRow, error: chapterError } = await supabase
        .from("chapters")
        .insert({
          book_id: book.id,
          chapter_number: chapter.chapterNumber,
          title: chapter.title,
          original_text: chapter.text,
          current_text: chapter.text,
        })
        .select("id")
        .single();

      if (chapterError) throw chapterError;

      for (const scene of chapter.scenes) {
        const { data: sceneRow, error: sceneError } = await supabase
          .from("scenes")
          .insert({
            book_id: book.id,
            chapter_id: chapterRow.id,
            scene_number: scene.sceneNumber,
            original_text: scene.text,
            current_text: scene.text,
          })
          .select("id")
          .single();

        if (sceneError) throw sceneError;

        const paragraphRows = scene.paragraphs.map((paragraph) => ({
          book_id: book.id,
          chapter_id: chapterRow.id,
          scene_id: sceneRow.id,
          paragraph_number: paragraph.paragraphNumber,
          original_text: paragraph.text,
          current_text: paragraph.text,
        }));

        if (paragraphRows.length) {
          const { error: paragraphError } = await supabase.from("paragraphs").insert(paragraphRows);
          if (paragraphError) throw paragraphError;
        }
      }
    }

    return NextResponse.json({
      bookId: book.id,
      chapterCount: parsed.chapters.length,
      paragraphCount: parsed.chapters.flatMap((chapter) => chapter.scenes.flatMap((scene) => scene.paragraphs)).length,
    });
  } catch (error) {
    console.error("Manuscript import failed", error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

function sanitizeStorageFileName(fileName: string) {
  const fallback = "manuscript";
  const normalized = fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");

  return normalized || fallback;
}
