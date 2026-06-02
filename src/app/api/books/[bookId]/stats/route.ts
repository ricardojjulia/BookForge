import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function wordCount(text: string | null): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export async function GET(_req: Request, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const [{ data: paragraphs }, { data: versions }, { data: chapters }] = await Promise.all([
    supabase.from("paragraphs").select("id,chapter_id,original_text,accepted_text").eq("book_id", bookId),
    supabase.from("revision_versions").select("paragraph_id,original_text,revised_text,accepted,rejected,revision_jobs(mode)").eq("book_id", bookId),
    supabase.from("chapters").select("id,chapter_number,title").eq("book_id", bookId).order("chapter_number"),
  ]);

  const totalOriginalWords = (paragraphs || []).reduce((sum, p) => sum + wordCount(p.original_text), 0);
  const totalAcceptedWords = (paragraphs || []).reduce((sum, p) => sum + wordCount(p.accepted_text || p.original_text), 0);

  const totalVersions = (versions || []).length;
  const acceptedVersions = (versions || []).filter((v) => v.accepted).length;
  const rejectedVersions = (versions || []).filter((v) => v.rejected).length;
  const pendingVersions = (versions || []).filter((v) => !v.accepted && !v.rejected).length;

  const modeBreakdown = (versions || []).reduce<Record<string, number>>((acc, v) => {
    const mode = (v.revision_jobs as { mode?: string | null } | null)?.mode || "unknown";
    acc[mode] = (acc[mode] || 0) + 1;
    return acc;
  }, {});

  const chapterStats = (chapters || []).map((chapter) => {
    const chapterParagraphs = (paragraphs || []).filter((p) => p.chapter_id === chapter.id);
    const originalWords = chapterParagraphs.reduce((sum, p) => sum + wordCount(p.original_text), 0);
    const acceptedWords = chapterParagraphs.reduce((sum, p) => sum + wordCount(p.accepted_text || p.original_text), 0);
    const acceptedParagraphs = chapterParagraphs.filter((p) => p.accepted_text).length;
    return {
      chapterId: chapter.id,
      chapterNumber: chapter.chapter_number,
      title: chapter.title,
      paragraphCount: chapterParagraphs.length,
      acceptedParagraphs,
      acceptedPercent: chapterParagraphs.length ? Math.round((acceptedParagraphs / chapterParagraphs.length) * 100) : 0,
      originalWords,
      acceptedWords,
      wordDelta: acceptedWords - originalWords,
    };
  });

  return NextResponse.json({
    totalOriginalWords,
    totalAcceptedWords,
    wordDelta: totalAcceptedWords - totalOriginalWords,
    totalVersions,
    acceptedVersions,
    rejectedVersions,
    pendingVersions,
    acceptanceRate: totalVersions ? Math.round((acceptedVersions / totalVersions) * 100) : 0,
    modeBreakdown,
    chapterStats,
  });
}
