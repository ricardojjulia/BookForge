import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  mode: z.enum(["full_review", "make_shorter", "make_longer"]),
  reviewStrategy: z.string().optional(),
});

function getError(e: unknown) {
  return e instanceof Error ? e.message : "Failed.";
}

export async function POST(request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await params;
    const body = schema.parse(await request.json());
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: book } = await supabase.from("books").select("id,title").eq("id", bookId).single();
    if (!book) return NextResponse.json({ error: "Book not found." }, { status: 404 });

    // Snapshot manuscript size at job-creation time so analytics can correlate
    // run duration with book size independently of future edits.
    const [{ count: chapterCount }, { count: paragraphCount }] = await Promise.all([
      supabase.from("chapters").select("id", { count: "exact", head: true }).eq("book_id", bookId),
      supabase.from("paragraphs").select("id", { count: "exact", head: true }).eq("book_id", bookId),
    ]);
    const bookStats = { chapters: chapterCount ?? 0, paragraphs: paragraphCount ?? 0 };

    // Cancel any previous running job for this book
    await supabase
      .from("auto_review_jobs")
      .update({ status: "cancelled", completed_at: new Date().toISOString() })
      .eq("book_id", bookId)
      .eq("status", "running");

    const { data: job, error } = await supabase
      .from("auto_review_jobs")
      .insert({
        book_id: bookId,
        user_id: user.id,
        mode: body.mode,
        status: "running",
        current_stage: "analyze",
        config: { reviewStrategy: body.reviewStrategy || "all" },
        book_stats: bookStats,
      })
      .select("id")
      .single();
    if (error) throw error;

    return NextResponse.json({ jobId: job.id });
  } catch (e) {
    return NextResponse.json({ error: getError(e) }, { status: 500 });
  }
}

export async function GET(_: Request, { params }: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: job } = await supabase
      .from("auto_review_jobs")
      .select("id,mode,status,current_stage,stages_completed,iteration,config,log,error,export_id,created_at,completed_at")
      .eq("book_id", bookId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({ job });
  } catch (e) {
    return NextResponse.json({ error: getError(e) }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await params;
    const body = await request.json() as {
      jobId: string;
      stage?: string;
      completed?: boolean;
      failed?: boolean;
      error?: string;
      exportId?: string;
      iteration?: number;
      logEntry?: Record<string, unknown>;
    };
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: job } = await supabase
      .from("auto_review_jobs")
      .select("id,stages_completed,log,iteration")
      .eq("id", body.jobId)
      .eq("book_id", bookId)
      .eq("user_id", user.id)
      .single();
    if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

    const stagesCompleted = body.stage
      ? Array.from(new Set([...(job.stages_completed || []), body.stage]))
      : job.stages_completed || [];

    const log = body.logEntry
      ? [...(job.log || []), { ...body.logEntry, ts: new Date().toISOString() }]
      : job.log || [];

    const updates: Record<string, unknown> = { stages_completed: stagesCompleted, log };

    if (body.stage) updates.current_stage = body.stage;
    if (body.iteration !== undefined) updates.iteration = body.iteration;
    if (body.exportId) updates.export_id = body.exportId;

    if (body.completed) {
      updates.status = "completed";
      updates.completed_at = new Date().toISOString();
    } else if (body.failed) {
      updates.status = "failed";
      updates.error = body.error || "Unknown error";
      updates.completed_at = new Date().toISOString();
    }

    const { error } = await supabase.from("auto_review_jobs").update(updates).eq("id", body.jobId);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: getError(e) }, { status: 500 });
  }
}
