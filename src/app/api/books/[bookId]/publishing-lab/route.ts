import { NextResponse } from "next/server";
import { z } from "zod";
import { buildJobProgress, createRevisionJobHeartbeat, getRevisionJobStatus, updateRevisionJobProgress, waitWhileRevisionJobPaused } from "@/lib/ai/job-state";
import { createClient } from "@/lib/supabase/server";
import { runPublishingLab } from "@/lib/publishing-lab/run";

const postSchema = z.object({
  action: z.enum(["run", "save_assets"]).default("run"),
  reportId: z.string().uuid().optional(),
  jobId: z.string().uuid().optional(),
  serverManaged: z.boolean().optional(),
});

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Publishing Lab failed.";
}

export async function GET(request: Request, context: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await context.params;
    const limitParam = new URL(request.url).searchParams.get("limit");
    const limit = Math.max(1, Math.min(25, Number(limitParam || 12) || 12));
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: reports, error } = await supabase
      .from("coherence_reports")
      .select("id,report_type,content,created_at")
      .eq("book_id", bookId)
      .eq("report_type", "publishing_lab_bundle")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return NextResponse.json({
      reports: reports || [],
      report: reports?.[0] || null,
    });
  } catch (error) {
    console.error("Publishing Lab GET failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await context.params;
    const body = postSchema.parse(await request.json().catch(() => ({})));
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: book, error: bookError } = await supabase
      .from("books")
      .select("id,owner_id,status")
      .eq("id", bookId)
      .eq("owner_id", user.id)
      .single();
    if (bookError || !book) return NextResponse.json({ error: "Book not found." }, { status: 404 });
    if (book.status !== "finished") {
      return NextResponse.json(
        { error: "Publishing Lab is only available for books marked as finished." },
        { status: 400 },
      );
    }

    if (body.action === "save_assets") {
      const report = await loadPublishingLabReport(supabase, bookId, body.reportId);
      if (!report) {
        return NextResponse.json({ error: "No Publishing Lab report found to save assets from." }, { status: 404 });
      }

      const count = await saveBundleAssetsToMatter(supabase, bookId, report.content as Record<string, unknown>);
      return NextResponse.json({ ok: true, savedSections: count, reportId: report.id });
    }

    const startedAt = new Date().toISOString();
    const totalUnits = 3;
    let jobId = body.jobId || "";
    let jobStatus = "running";
    let jobSettings: unknown = {
      unit: "publishing_lab_phase",
      progress: buildJobProgress({
        taskName: "Run Publishing Lab",
        currentUnit: "Preparing Publishing Lab run",
        totalUnits,
        attempted: 0,
        successful: 0,
        failed: 0,
        skipped: 0,
        startedAt,
        estimatedSecondsPerUnit: 25,
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
      if (!existingJob) return NextResponse.json({ error: "Publishing Lab job not found." }, { status: 404 });
      if (existingJob.status === "completed") {
        return NextResponse.json({ ok: true, message: "Publishing Lab job already completed." });
      }
      if (existingJob.status === "failed") {
        return NextResponse.json({ ok: true, message: "Publishing Lab job already failed." });
      }
      jobStatus = String(existingJob.status || "running");
      jobSettings = existingJob.settings || jobSettings;
    } else {
      const status = body.serverManaged ? "queued" : "running";
      const { data: job, error: jobError } = await supabase
        .from("revision_jobs")
        .insert({
          book_id: bookId,
          mode: "publishing_lab",
          status,
          settings: {
            unit: "publishing_lab_phase",
            progress: buildJobProgress({
              taskName: "Run Publishing Lab",
              currentUnit: status === "queued" ? "Queued" : "Preparing Publishing Lab run",
              totalUnits,
              attempted: 0,
              successful: 0,
              failed: 0,
              skipped: 0,
              startedAt: status === "running" ? startedAt : null,
              estimatedSecondsPerUnit: 25,
            }),
          },
          prompt_snapshot: "Publishing Lab: post-finish consensus + assets + covers.",
          created_by: user.id,
          started_at: status === "running" ? startedAt : null,
        })
        .select("id")
        .single();
      if (jobError) throw jobError;
      jobId = job.id;
      jobStatus = status;

      if (body.serverManaged) {
        return NextResponse.json({ content: { jobId, queued: true, totalUnits } });
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
            unit: "publishing_lab_phase",
            progress: buildJobProgress({
              taskName: "Run Publishing Lab",
              currentUnit: "Cancelled",
              totalUnits,
              attempted: 0,
              successful: 0,
              failed: 0,
              skipped: totalUnits,
              startedAt,
              completedAt,
              estimatedSecondsPerUnit: 25,
              message: "Publishing Lab run was cancelled before execution started.",
            }),
          },
        })
        .eq("id", jobId);
      return NextResponse.json({ ok: true, message: "Publishing Lab job cancelled." });
    }

    jobSettings = await updateRevisionJobProgress(supabase, jobId, jobSettings, {
      currentUnit: "Running judges and generating publishing assets",
      totalUnits,
      attempted: 1,
      successful: 0,
      failed: 0,
      skipped: 0,
    });

    const heartbeat = createRevisionJobHeartbeat(supabase, jobId, jobSettings, {
      currentUnit: "Running judges and generating publishing assets",
      totalUnits,
      attempted: 1,
      successful: 0,
      failed: 0,
      skipped: 0,
    });

    try {
      const content = await runPublishingLab({ supabase, bookId, userId: user.id });

      const { data: latestReport } = await supabase
        .from("coherence_reports")
        .select("id,created_at")
        .eq("book_id", bookId)
        .eq("report_type", "publishing_lab_bundle")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const completedAt = new Date().toISOString();
      const finalStatus = await getRevisionJobStatus(supabase, jobId);
      const completedStatus = finalStatus === "cancelled" ? "cancelled" : "completed";
      await supabase
        .from("revision_jobs")
        .update({
          status: completedStatus,
          completed_at: completedAt,
          settings: {
            unit: "publishing_lab_phase",
            progress: buildJobProgress({
              taskName: "Run Publishing Lab",
              currentUnit: completedStatus === "cancelled" ? "Cancelled" : "Complete",
              totalUnits,
              attempted: 1,
              successful: completedStatus === "cancelled" ? 0 : 1,
              failed: 0,
              skipped: completedStatus === "cancelled" ? totalUnits - 1 : 0,
              startedAt,
              completedAt,
              estimatedSecondsPerUnit: 25,
              message:
                completedStatus === "cancelled"
                  ? "Publishing Lab run was cancelled during execution."
                  : "Publishing Lab bundle generated and saved.",
            }),
          },
        })
        .eq("id", jobId);

      return NextResponse.json({
        content,
        reportId: latestReport?.id || null,
        createdAt: latestReport?.created_at || null,
        revisionJobId: jobId,
      });
    } catch (runError) {
      const completedAt = new Date().toISOString();
      const message = getErrorMessage(runError);
      await supabase
        .from("revision_jobs")
        .update({
          status: "failed",
          completed_at: completedAt,
          error_message: message,
          settings: {
            unit: "publishing_lab_phase",
            progress: buildJobProgress({
              taskName: "Run Publishing Lab",
              currentUnit: "Failed",
              totalUnits,
              attempted: 1,
              successful: 0,
              failed: 1,
              skipped: 0,
              startedAt,
              completedAt,
              estimatedSecondsPerUnit: 25,
              message,
            }),
          },
        })
        .eq("id", jobId);
      throw runError;
    } finally {
      heartbeat.stop();
    }
  } catch (error) {
    console.error("Publishing Lab POST failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

async function loadPublishingLabReport(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bookId: string,
  reportId?: string,
) {
  if (reportId) {
    const { data } = await supabase
      .from("coherence_reports")
      .select("id,content")
      .eq("book_id", bookId)
      .eq("report_type", "publishing_lab_bundle")
      .eq("id", reportId)
      .maybeSingle();
    return data;
  }

  const { data } = await supabase
    .from("coherence_reports")
    .select("id,content")
    .eq("book_id", bookId)
    .eq("report_type", "publishing_lab_bundle")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function saveBundleAssetsToMatter(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bookId: string,
  reportContent: Record<string, unknown>,
) {
  const assets = reportContent.assets && typeof reportContent.assets === "object"
    ? (reportContent.assets as Record<string, unknown>)
    : {};

  const rows = [
    {
      section_type: "introduction",
      title: "Publishing Lab - Book Description",
      content: stringValue(assets.description),
    },
    {
      section_type: "dedication",
      title: "Publishing Lab - Dedication",
      content: stringValue(assets.dedication),
    },
    {
      section_type: "preface",
      title: "Publishing Lab - Front Matter",
      content: stringValue(assets.frontMatter),
    },
    {
      section_type: "appendix",
      title: "Publishing Lab - Back Matter",
      content: stringValue(assets.backMatter),
    },
    {
      section_type: "author_bio",
      title: "Publishing Lab - Author Biography",
      content: stringValue(assets.authorBiography),
    },
  ].filter((row) => row.content.trim().length > 0);

  if (!rows.length) return 0;

  await supabase
    .from("book_matter_sections")
    .delete()
    .eq("book_id", bookId)
    .in("title", rows.map((row) => row.title));

  const { data: currentRows } = await supabase
    .from("book_matter_sections")
    .select("sort_order")
    .eq("book_id", bookId)
    .order("sort_order", { ascending: false })
    .limit(1);

  const nextSort = Number(currentRows?.[0]?.sort_order || 0);

  const inserts = rows.map((row, index) => ({
    book_id: bookId,
    section_type: row.section_type,
    title: row.title,
    content: row.content,
    sort_order: nextSort + index + 1,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from("book_matter_sections").insert(inserts);
  if (error) throw error;
  return inserts.length;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}
