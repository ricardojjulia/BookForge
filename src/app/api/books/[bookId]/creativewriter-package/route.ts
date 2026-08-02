import { NextResponse } from "next/server";
import { z } from "zod";
import { buildCreativeWriterPackageFromRows } from "@/lib/creativewriter-cloud/package-transfer";
import { createClient } from "@/lib/supabase/server";

const querySchema = z.object({
  sourceMode: z.enum(["accepted", "current", "original"]).default("accepted"),
});

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unable to download CreativeWriter package.";
}

export async function GET(request: Request, context: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await context.params;
    const options = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const [
      { data: book, error: bookError },
      { data: chapters, error: chaptersError },
      { data: paragraphs, error: paragraphsError },
      { data: bookBible, error: bibleError },
      { data: revisions, error: revisionsError },
    ] = await Promise.all([
      supabase.from("books").select("id,title,author_name,status").eq("id", bookId).single(),
      supabase
        .from("chapters")
        .select("id,chapter_number,title,summary")
        .eq("book_id", bookId)
        .order("chapter_number"),
      supabase
        .from("paragraphs")
        .select("id,chapter_id,paragraph_number,original_text,current_text,accepted_text")
        .eq("book_id", bookId)
        .order("paragraph_number"),
      supabase.from("book_bibles").select("content,updated_at").eq("book_id", bookId).maybeSingle(),
      supabase
        .from("revision_versions")
        .select("id,paragraph_id,revised_text,revision_notes,accepted,rejected,created_at")
        .eq("book_id", bookId)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    if (bookError) throw bookError;
    if (chaptersError) throw chaptersError;
    if (paragraphsError) throw paragraphsError;
    if (bibleError) throw bibleError;
    if (revisionsError) throw revisionsError;
    if (!book) return NextResponse.json({ error: "Book not found." }, { status: 404 });

    const pkg = buildCreativeWriterPackageFromRows({
      rows: {
        book,
        chapters: chapters || [],
        paragraphs: paragraphs || [],
        bookBible,
        revisions: revisions || [],
      },
      userId: user.id,
      sourceMode: options.sourceMode,
    });

    return NextResponse.json({
      content: {
        package: pkg,
        downloadName: `${slugify(book.title || "bookforge-book")}.bookforge.json`,
        sourceMode: options.sourceMode,
        chapterCount: chapters?.length || 0,
        paragraphCount: paragraphs?.length || 0,
      },
    });
  } catch (error) {
    console.error("CreativeWriter package download failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "bookforge-book";
}
