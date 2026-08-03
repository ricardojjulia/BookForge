import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { detectAndHealStaleAutoReviewJobs } from "@/lib/ai/job-state";

const schema = z.object({
  mode: z.enum(["full_review", "make_shorter", "make_longer"]),
  reviewStrategy: z.string().optional(),
  jobId: z.string().uuid().optional(),
  serverManaged: z.boolean().optional(),
  metadataSnapshotId: z.string().uuid().optional(),
  metadataBranchName: z.string().min(1).max(80).optional(),
});

type MetadataSelectionSource = "explicit_snapshot" | "branch_active" | "active_snapshot";

function getError(e: unknown) {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const candidate = e as { message?: unknown; error?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [candidate.message, candidate.error, candidate.details, candidate.hint]
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map((v) => v.trim());
    if (parts.length > 0) {
      const suffix = typeof candidate.code === "string" && candidate.code.trim() ? ` (code: ${candidate.code.trim()})` : "";
      return `${parts.join(" | ")}${suffix}`;
    }
  }
  return "Failed.";
}

function isTransientJsonParseError(e: unknown) {
  const message = e instanceof Error ? e.message : String(e || "");
  return /Unexpected end of JSON input/i.test(message);
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

    // auto_review_jobs currently accepts running/completed/failed/cancelled only.
    // Keep serverManaged semantics at the API layer, but persist as running.
    const status = "running";
    const metadataSelectionSource: MetadataSelectionSource = body.metadataSnapshotId
      ? "explicit_snapshot"
      : body.metadataBranchName
        ? "branch_active"
        : "active_snapshot";

    if (body.jobId) {
      const { data: existingJob, error: existingJobError } = await supabase
        .from("auto_review_jobs")
        .select("id,status,mode")
        .eq("id", body.jobId)
        .eq("book_id", bookId)
        .eq("user_id", user.id)
        .single();
      if (existingJobError) throw existingJobError;
      if (!existingJob) return NextResponse.json({ error: "Job not found." }, { status: 404 });
      if (existingJob.mode !== body.mode) {
        return NextResponse.json({ error: "Mode does not match existing job." }, { status: 400 });
      }

      if (existingJob.status !== "completed") {
        // Refuse to reset-and-relaunch if the underlying work is verifiably
        // still alive (a revision_jobs row for this book with a heartbeat
        // in the last 90s). Without this, clicking "Resume" while a
        // previous run was still genuinely active would restart the whole
        // pipeline from "analyze" -- duplicating the baseline critic sweep
        // on top of whatever was already running. Found live: repeated
        // resumes on one book left 13 full_book_rewrite jobs running in
        // true parallel for ~2 hours before being caught.
        const { data: activeUnderlyingJobs } = await supabase
          .from("revision_jobs")
          .select("id,settings")
          .eq("book_id", bookId)
          .eq("status", "running");
        const stillAlive = (activeUnderlyingJobs || []).some((row) => {
          const heartbeatAt = (row.settings as { progress?: { lastHeartbeatAt?: string } } | null)?.progress?.lastHeartbeatAt;
          if (!heartbeatAt) return false;
          return Date.now() - new Date(heartbeatAt).getTime() < 90000;
        });
        if (stillAlive) {
          return NextResponse.json(
            { error: "This book's Auto-Review run is still actively working. Wait for it to finish or fail before resuming." },
            { status: 409 },
          );
        }

        const updatePayload: Record<string, unknown> = {
          status,
          error: null,
          completed_at: null,
        };
        if (status === "running") {
          updatePayload.current_stage = "analyze";
        }
        const { error: resumeError } = await supabase.from("auto_review_jobs").update(updatePayload).eq("id", existingJob.id);
        if (resumeError) throw resumeError;
      }

      if (body.serverManaged) {
        return NextResponse.json({ content: { jobId: existingJob.id, queued: true, totalUnits: 1 } });
      }
      return NextResponse.json({ jobId: existingJob.id });
    }

    // Cancel any previous in-flight job for this book.
    await supabase
      .from("auto_review_jobs")
      .update({ status: "cancelled", completed_at: new Date().toISOString() })
      .eq("book_id", bookId)
      .in("status", ["running"]);

    const { data: job, error } = await supabase
      .from("auto_review_jobs")
      .insert({
        book_id: bookId,
        user_id: user.id,
        mode: body.mode,
        status,
        current_stage: "analyze",
        config: {
          reviewStrategy: body.reviewStrategy || "all",
          metadataSnapshotId: body.metadataSnapshotId || null,
          metadataBranchName: body.metadataBranchName || null,
          metadataSelectionSource,
        },
        book_stats: bookStats,
      })
      .select("id")
      .single();
    if (error) throw error;

    if (body.serverManaged) {
      return NextResponse.json({ content: { jobId: job.id, queued: true, totalUnits: 1, metadataSelectionSource } });
    }
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
      .select("id,book_id,mode,status,current_stage,stages_completed,iteration,config,log,error,export_id,created_at,completed_at")
      .eq("book_id", bookId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (job) {
      const healedIds = await detectAndHealStaleAutoReviewJobs(supabase, user.id, [job]);
      if (healedIds.includes(job.id)) {
        job.status = "failed";
        job.error = "Auto-detected as stalled. Resume from Auto-Review Wizard to continue from the next unfinished stage.";
      }
    }

    return NextResponse.json({ job });
  } catch (e) {
    if (isTransientJsonParseError(e)) {
      console.warn("Auto-review status polling transient parse error", e);
      return NextResponse.json({ job: null, transient: true });
    }
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
