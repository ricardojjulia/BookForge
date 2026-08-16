import { NextResponse } from "next/server";
import { z } from "zod";
import {
  buildJobProgress,
  createRevisionJobHeartbeat,
  getRevisionJobStatus,
  updateRevisionJobProgress,
  waitWhileRevisionJobPaused,
} from "@/lib/ai/job-state";
import { markBookRevising } from "@/lib/books/status";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  jobId: z.string().uuid().optional(),
  serverManaged: z.boolean().optional(),
  chapterId: z.string().uuid().optional(),
});

type PendingRevisionRow = {
  id: string;
  paragraph_id: string | null;
  revised_text: string;
  created_at: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unable to accept pending revisions.";
}

// Mirrors /api/revisions/batch's accept branch, but deterministically for
// every pending draft on the book instead of an explicit versionIds list --
// the deliberate, non-random counterpart to auto-revision's weighted
// accept/reject/redo (see auto-revision/route.ts), used when a rewrite
// cycle should keep everything it just drafted rather than dice-rolling it.
function latestVersionPerParagraph(versions: PendingRevisionRow[]) {
  const byParagraph = new Map<string, PendingRevisionRow>();
  for (const version of versions) {
    if (!version.paragraph_id) continue;
    const existing = byParagraph.get(version.paragraph_id);
    if (!existing || Date.parse(version.created_at) > Date.parse(existing.created_at)) {
      byParagraph.set(version.paragraph_id, version);
    }
  }
  return Array.from(byParagraph.values());
}

export async function POST(request: Request, context: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await context.params;
    const { jobId: requestedJobId, serverManaged, chapterId } = schema.parse(await readJsonBody(request));
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const startedAt = new Date().toISOString();
    let jobId = requestedJobId || "";
    let jobStatus = "running";
    let jobSettings: unknown = {
      unit: "revision_accept_all",
      progress: buildJobProgress({
        taskName: "Accept all pending rewrite drafts",
        currentUnit: "Preparing to accept pending drafts",
        totalUnits: 1,
        attempted: 1,
        successful: 0,
        failed: 0,
        skipped: 0,
        startedAt,
        estimatedSecondsPerUnit: 5,
      }),
    };

    if (jobId) {
      const { data: existingJob, error: existingJobError } = await supabase
        .from("revision_jobs")
        .select("id,status,settings")
        .eq("id", jobId)
        .eq("book_id", bookId)
        .eq("created_by", user.id)
        .single();
      if (existingJobError) throw existingJobError;
      if (!existingJob) return NextResponse.json({ error: "Accept-all job not found." }, { status: 404 });
      if (existingJob.status === "completed") return NextResponse.json({ ok: true, message: "Accept-all job already completed." });
      if (existingJob.status === "failed") return NextResponse.json({ ok: true, message: "Accept-all job already failed." });
      jobStatus = String(existingJob.status || "running");
      jobSettings = existingJob.settings || jobSettings;
    } else {
      const status = serverManaged ? "queued" : "running";
      const { data: createdJob, error: createdJobError } = await supabase
        .from("revision_jobs")
        .insert({
          book_id: bookId,
          mode: "revision_accept_all",
          status,
          settings: {
            unit: "revision_accept_all",
            progress: buildJobProgress({
              taskName: "Accept all pending rewrite drafts",
              currentUnit: status === "queued" ? "Queued" : "Preparing to accept pending drafts",
              totalUnits: 1,
              attempted: 1,
              successful: 0,
              failed: 0,
              skipped: 0,
              startedAt: status === "running" ? startedAt : null,
              estimatedSecondsPerUnit: 5,
            }),
          },
          prompt_snapshot: "Deterministic accept-all of pending rewrite drafts.",
          created_by: user.id,
          started_at: status === "running" ? startedAt : null,
        })
        .select("id")
        .single();
      if (createdJobError) throw createdJobError;
      jobId = createdJob.id;
      jobStatus = status;

      if (serverManaged) {
        return NextResponse.json({ content: { jobId, queued: true, totalUnits: 1 } });
      }
    }

    if (jobStatus !== "running") {
      await supabase
        .from("revision_jobs")
        .update({ status: "running", started_at: startedAt })
        .eq("id", jobId)
        .eq("book_id", bookId)
        .eq("created_by", user.id);
    }

    const pauseStatus = await waitWhileRevisionJobPaused(supabase, jobId);
    if (pauseStatus === "cancelled") {
      const completedAt = new Date().toISOString();
      await supabase
        .from("revision_jobs")
        .update({
          status: "cancelled",
          completed_at: completedAt,
          settings: {
            unit: "revision_accept_all",
            progress: buildJobProgress({
              taskName: "Accept all pending rewrite drafts",
              currentUnit: "Cancelled",
              totalUnits: 1,
              attempted: 0,
              successful: 0,
              failed: 0,
              skipped: 1,
              startedAt,
              completedAt,
              estimatedSecondsPerUnit: 5,
              message: "Accept-all cancelled before execution started.",
            }),
          },
        })
        .eq("id", jobId);
      return NextResponse.json({ ok: true, message: "Accept-all job cancelled." });
    }

    jobSettings = await updateRevisionJobProgress(supabase, jobId, jobSettings, {
      currentUnit: "Loading pending rewrite drafts",
      totalUnits: 1,
      attempted: 1,
      successful: 0,
      failed: 0,
      skipped: 0,
    });

    const heartbeat = createRevisionJobHeartbeat(supabase, jobId, jobSettings, {
      currentUnit: "Accepting pending rewrite drafts",
      totalUnits: 1,
      attempted: 1,
      successful: 0,
      failed: 0,
      skipped: 0,
    });

    let acceptedCount = 0;
    try {
      let pendingQuery = supabase
        .from("revision_versions")
        .select("id,paragraph_id,revised_text,created_at")
        .eq("book_id", bookId)
        .eq("accepted", false)
        .eq("rejected", false)
        .not("paragraph_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (chapterId) pendingQuery = pendingQuery.eq("chapter_id", chapterId);
      const { data: pendingVersions, error: pendingError } = await pendingQuery;
      if (pendingError) throw pendingError;

      const latestPerParagraph = latestVersionPerParagraph((pendingVersions || []) as PendingRevisionRow[]);
      const paragraphIds = latestPerParagraph.map((version) => version.paragraph_id) as string[];
      const { data: paragraphRows, error: paragraphLookupError } = paragraphIds.length
        ? await supabase.from("paragraphs").select("id,is_locked").in("id", paragraphIds)
        : { data: [], error: null };
      if (paragraphLookupError) throw paragraphLookupError;
      const lockedParagraphIds = new Set(
        ((paragraphRows || []) as Array<{ id: string; is_locked: boolean | null }>)
          .filter((row) => row.is_locked)
          .map((row) => row.id),
      );

      const toAccept = latestPerParagraph.filter(
        (version) => version.paragraph_id && !lockedParagraphIds.has(version.paragraph_id),
      );

      const acceptedEvents: Array<Record<string, unknown>> = [];
      for (const version of toAccept) {
        const paragraphId = version.paragraph_id as string;

        const { error: clearError } = await supabase
          .from("revision_versions")
          .update({ accepted: false, rejected: true })
          .eq("paragraph_id", paragraphId)
          .eq("book_id", bookId)
          .neq("id", version.id);
        if (clearError) throw clearError;

        const { error: paragraphError } = await supabase
          .from("paragraphs")
          .update({
            accepted_text: version.revised_text,
            current_text: version.revised_text,
            updated_at: new Date().toISOString(),
          })
          .eq("id", paragraphId);
        if (paragraphError) throw paragraphError;

        const { error: acceptError } = await supabase
          .from("revision_versions")
          .update({ accepted: true, rejected: false })
          .eq("id", version.id);
        if (acceptError) throw acceptError;

        acceptedEvents.push({ revisionVersionId: version.id, paragraphId });
        acceptedCount += 1;
      }

      if (acceptedEvents.length) {
        await supabase.from("coherence_reports").insert({
          book_id: bookId,
          report_type: "continuity_ledger",
          content: {
            event: "revision_batch_accepted",
            acceptedAt: new Date().toISOString(),
            acceptedCount: acceptedEvents.length,
            acceptedEvents,
            note: "Focused-rewrite accept-all became active paragraph text. Preserve this state in future rewrite context.",
          },
        });
        await markBookRevising(supabase, bookId);
      }
    } catch (acceptError) {
      const message = getErrorMessage(acceptError);
      await supabase
        .from("revision_jobs")
        .update({
          status: "failed",
          error_message: message,
          completed_at: new Date().toISOString(),
          settings: {
            unit: "revision_accept_all",
            progress: buildJobProgress({
              taskName: "Accept all pending rewrite drafts",
              currentUnit: "Failed",
              totalUnits: 1,
              attempted: 1,
              successful: 0,
              failed: 1,
              skipped: 0,
              startedAt,
              completedAt: new Date().toISOString(),
              estimatedSecondsPerUnit: 5,
              message,
            }),
          },
        })
        .eq("id", jobId);
      throw acceptError;
    } finally {
      heartbeat.stop();
    }

    const completedAt = new Date().toISOString();
    const finalStatus = await getRevisionJobStatus(supabase, jobId);
    const completedStatus = finalStatus === "cancelled" ? "cancelled" : "completed";
    const { error: finalJobError } = await supabase
      .from("revision_jobs")
      .update({
        status: completedStatus,
        completed_at: completedAt,
        settings: {
          unit: "revision_accept_all",
          progress: buildJobProgress({
            taskName: "Accept all pending rewrite drafts",
            currentUnit: completedStatus === "cancelled" ? "Cancelled" : "Complete",
            totalUnits: 1,
            attempted: 1,
            successful: completedStatus === "cancelled" ? 0 : 1,
            failed: 0,
            skipped: completedStatus === "cancelled" ? 1 : 0,
            startedAt,
            completedAt,
            estimatedSecondsPerUnit: 5,
            message:
              completedStatus === "cancelled"
                ? "Accept-all cancelled during execution."
                : `Accepted ${acceptedCount} pending paragraph draft(s).`,
          }),
        },
      })
      .eq("id", jobId);
    if (finalJobError) throw finalJobError;

    return NextResponse.json({ content: { accepted: acceptedCount }, revisionJobId: jobId });
  } catch (error) {
    console.error("Accept-all pending revisions failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
