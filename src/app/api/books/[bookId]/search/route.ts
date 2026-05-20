import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() || "";

  if (query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { data: book } = await supabase
    .from("books")
    .select("id")
    .eq("id", bookId)
    .single();
  if (!book) return NextResponse.json({ error: "Book not found." }, { status: 404 });

  const lower = query.toLowerCase();

  const { data: paragraphs } = await supabase
    .from("paragraphs")
    .select("id,book_id,chapter_id,scene_id,paragraph_number,original_text,accepted_text")
    .eq("book_id", bookId)
    .or(`original_text.ilike.%${lower}%,accepted_text.ilike.%${lower}%`)
    .limit(60);

  const chapterIds = [...new Set((paragraphs || []).map((p) => p.chapter_id).filter(Boolean))];
  const { data: chapters } = chapterIds.length
    ? await supabase.from("chapters").select("id,chapter_number,title").in("id", chapterIds)
    : { data: [] };

  const chapterMap = Object.fromEntries((chapters || []).map((c) => [c.id, c]));

  const results = (paragraphs || []).map((p) => {
    const text = (p.accepted_text || p.original_text || "") as string;
    const idx = text.toLowerCase().indexOf(lower);
    const start = Math.max(0, idx - 80);
    const end = Math.min(text.length, idx + query.length + 80);
    const excerpt =
      (start > 0 ? "…" : "") +
      text.slice(start, idx) +
      `[[${text.slice(idx, idx + query.length)}]]` +
      text.slice(idx + query.length, end) +
      (end < text.length ? "…" : "");
    const chapter = chapterMap[p.chapter_id];
    return {
      paragraphId: p.id,
      chapterId: p.chapter_id,
      chapterNumber: chapter?.chapter_number ?? null,
      chapterTitle: chapter?.title ?? null,
      paragraphNumber: p.paragraph_number,
      excerpt,
      isAccepted: Boolean(p.accepted_text),
    };
  });

  return NextResponse.json({ results, query });
}
