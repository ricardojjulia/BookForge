import { NextResponse } from "next/server";
import { z } from "zod";
import { buildJobProgress, createRevisionJobHeartbeat, getRevisionJobStatus, updateRevisionJobProgress, waitWhileRevisionJobPaused } from "@/lib/ai/job-state";
import { buildCloudRewriteModelSelection, selectBestRewriteModel } from "@/lib/ai/rewrite-model-suitability";
import { createManagedChatCompletion } from "@/lib/lmstudio/client";
import { getLmStudioErrorMessage } from "@/lib/lmstudio/errors";
import { parseModelJsonOrFallback } from "@/lib/lmstudio/json";
import { getDraftModelCandidates } from "@/lib/lmstudio/model-selection";
import { selectAndPrepareActiveModel } from "@/lib/lmstudio/orchestrator";
import { getUserLmStudioSettings } from "@/lib/lmstudio/settings";
import { buildFullBookRewriteUnitPrompt } from "@/lib/prompts/builders";
import { buildRewriteContextPacket } from "@/lib/rewrite/context-packet";
import { applyRewritePlanDefaults } from "@/lib/rewrite/plan-defaults";
import { clampStrategySettings, getRewriteStrategy, rewriteStrategies } from "@/lib/rewrite/strategies";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  jobId: z.string().uuid().optional(),
  serverManaged: z.boolean().optional(),
  maxUnits: z.number().int().positive().max(5000).optional(),
  campaignId: z.string().uuid().optional(),
  paragraphId: z.string().uuid().optional(),
  chapterId: z.string().uuid().optional(),
  rewriteExistingDrafts: z.boolean().default(false),
  rewriteAccepted: z.boolean().default(false),
  retryJobId: z.string().uuid().optional(),
  distributeAcrossChapters: z.boolean().default(false),
  coverageMode: z.enum(["normal", "uncovered_chapter_sample"]).default("normal"),
  strategyId: z.enum([
    "conservative_polish",
    "humanized_literary",
    "clarity_readability",
    "downsize_abridge",
    "emotional_depth",
    "contemporary_view",
    "creative_enhancement",
    "custom",
  ]).default("humanized_literary"),
  strategySettings: z
    .object({
      voicePreservation: z.number().optional(),
      expansionLimitPercent: z.number().optional(),
      sentenceRhythm: z.number().optional(),
      literaryIntensity: z.number().optional(),
      readabilityTarget: z.string().optional(),
      theologicalEmphasis: z.number().optional(),
      continuityStrictness: z.number().optional(),
      targetReductionPercent: z.number().optional(),
    })
    .optional(),
  authorInstructions: z.string().max(3000).optional(),
});

type ChapterRow = {
  id: string;
  chapter_number: number;
  title: string | null;
  summary: string | null;
  exclude_from_rewrite?: boolean | null;
  section_type?: string | null;
};

type ParagraphRow = {
  id: string;
  chapter_id?: string;
  paragraph_number: number;
  original_text: string;
  accepted_text?: string | null;
  is_locked: boolean | null;
  scene_id: string | null;
};

type ExistingRevisionRow = {
  paragraph_id: string | null;
  accepted: boolean | null;
  rejected: boolean | null;
};

type AcceptedRevisionContextRow = {
  paragraph_id: string | null;
  revised_text: string;
  revision_notes: string | null;
  continuity_warnings: unknown;
  created_at: string | null;
};

type LockedPassageContextRow = {
  paragraph_id: string | null;
  reason: string | null;
};

type RetryJobSettings = {
  progress?: {
    failedUnits?: Array<{ id?: string; type?: string }>;
  };
};

function getErrorMessage(error: unknown) {
  const lmStudioMessage = getLmStudioErrorMessage(error, "");
  if (lmStudioMessage) return lmStudioMessage;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Rewrite execution failed.";
}

export async function POST(request: Request, context: { params: Promise<{ bookId: string }> }) {
  const startedAt = new Date().toISOString();

  try {
    const { bookId } = await context.params;
    const body = schema.parse(await readJsonBody(request));
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const [
      { data: book },
      { data: bible },
      { data: rewritePlan, error: planError },
      { data: continuityLedger },
      { data: chapters, error: chaptersError },
      { data: existingRevisions, error: existingError },
      { data: criticReports, error: criticReportsError },
      { data: acceptedRevisionRows, error: acceptedRevisionRowsError },
      { data: lockedPassageRows, error: lockedPassageRowsError },
    ] = await Promise.all([
      supabase.from("books").select("dialog_density").eq("id", bookId).single(),
      supabase.from("book_bibles").select("content,voice_profile").eq("book_id", bookId).maybeSingle(),
      supabase
        .from("coherence_reports")
        .select("content")
        .eq("book_id", bookId)
        .eq("report_type", "rewrite_plan")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("coherence_reports")
        .select("content,created_at")
        .eq("book_id", bookId)
        .eq("report_type", "continuity_ledger")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("chapters")
        .select("id,chapter_number,title,summary,section_type,exclude_from_rewrite")
        .eq("book_id", bookId)
        .order("chapter_number"),
      supabase
        .from("revision_versions")
        .select("paragraph_id,accepted,rejected")
        .eq("book_id", bookId)
        .not("paragraph_id", "is", null),
      supabase
        .from("coherence_reports")
        .select("report_type,content,created_at")
        .eq("book_id", bookId)
        .like("report_type", "critic:%")
        .order("created_at", { ascending: false })
        .limit(14),
      supabase
        .from("revision_versions")
        .select("paragraph_id,revised_text,revision_notes,continuity_warnings,created_at")
        .eq("book_id", bookId)
        .eq("accepted", true)
        .not("paragraph_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("locked_passages")
        .select("paragraph_id,reason")
        .eq("book_id", bookId),
    ]);

    if (planError) throw planError;
    if (chaptersError) throw chaptersError;
    if (existingError) throw existingError;
    if (criticReportsError) throw criticReportsError;
    if (acceptedRevisionRowsError) throw acceptedRevisionRowsError;
    if (lockedPassageRowsError) throw lockedPassageRowsError;
    if (!rewritePlan?.content) {
      return NextResponse.json({ error: "Generate a Rewrite Architect plan before executing the rewrite." }, { status: 400 });
    }
    if (body.campaignId) {
      const { data: campaign, error: campaignError } = await supabase
        .from("rewrite_campaigns")
        .select("status")
        .eq("id", body.campaignId)
        .eq("book_id", bookId)
        .single();
      if (campaignError) throw campaignError;
      if (["paused", "cancelled", "completed"].includes(String(campaign.status || ""))) {
        return NextResponse.json({ error: `Rewrite campaign is ${campaign.status}. Resume or create a new campaign before running another batch.` }, { status: 400 });
      }
    }

    const normalizedRewritePlan = {
      ...applyRewritePlanDefaults(rewritePlan.content as Record<string, unknown>),
      latestContinuityLedger: continuityLedger?.content || null,
    };
    const settings = await getUserLmStudioSettings(user.id);
    const expectedCalls = body.maxUnits || Number(rewritePlan.content?.totalParagraphs || 12);
    const modelPlan = await selectAndPrepareActiveModel(settings, {
      task: "rewrite",
      candidates: getDraftModelCandidates(settings),
      expectedCalls,
      latencyPreference: settings.qualityProfile === "premium" ? "quality" : settings.qualityProfile === "fast" ? "fast" : "balanced",
      allowUnload: true,
      telemetry: { supabase, userId: user.id },
    });
    const { client, model, preparedModel, modelSelection, availableModels, telemetryContext } = modelPlan;
    const rewriteSelection =
      preparedModel.isCloud && settings.standardSettings
        ? buildCloudRewriteModelSelection(settings.standardSettings)
        : selectBestRewriteModel(availableModels, {
            qualityProfile: settings.qualityProfile,
            contextWindowTokens: settings.contextWindowTokens,
          });
    const selectedStrategy = getRewriteStrategy(body.strategyId);
    const rewriteStrategy = {
      ...selectedStrategy,
      settings: clampStrategySettings({
        ...selectedStrategy.settings,
        ...(body.strategySettings || {}),
      }),
      instructions:
        body.strategyId === "custom" && body.authorInstructions?.trim()
          ? [...rewriteStrategies.custom.instructions, body.authorInstructions.trim()]
          : selectedStrategy.instructions,
    };

    let jobId = body.jobId || "";
    let jobStatus = "running";

    if (jobId) {
      const { data: existingJob, error: existingJobError } = await supabase
        .from("revision_jobs")
        .select("id,status")
        .eq("id", jobId)
        .eq("book_id", bookId)
        .eq("created_by", user.id)
        .single();
      if (existingJobError) throw existingJobError;
      if (!existingJob) return NextResponse.json({ error: "Rewrite job not found." }, { status: 404 });
      if (existingJob.status === "completed") return NextResponse.json({ ok: true, message: "Rewrite job already completed." });
      if (existingJob.status === "failed") return NextResponse.json({ ok: true, message: "Rewrite job already failed." });
      jobStatus = String(existingJob.status || "running");
    } else {
      const status = body.serverManaged ? "queued" : "running";
      const { data: job, error: jobError } = await supabase
        .from("revision_jobs")
        .insert({
          book_id: bookId,
          mode: "full_book_rewrite",
          status,
          settings: {
            model,
            preparedModel,
            modelSelection,
            campaignId: body.campaignId || null,
            rewriteModelSelection: rewriteSelection,
            maxUnits: body.maxUnits || null,
            rewriteExistingDrafts: body.rewriteExistingDrafts,
            rewriteAccepted: body.rewriteAccepted,
            distributeAcrossChapters: body.distributeAcrossChapters,
            strategyId: rewriteStrategy.id,
            strategyLabel: rewriteStrategy.label,
            strategySettings: rewriteStrategy.settings,
            authorInstructions: body.authorInstructions || null,
            unit: "paragraph",
            progress: buildJobProgress({
              taskName: "Full-book rewrite draft",
              currentUnit: "Planning eligible paragraphs",
              totalUnits: body.maxUnits || 0,
              attempted: 0,
              successful: 0,
              failed: 0,
              skipped: 0,
              startedAt,
              estimatedSecondsPerUnit: estimateSecondsPerRewriteUnit(model),
            }),
          },
          prompt_snapshot:
            "Full-book rewrite executor: paragraph units with Manuscript Blueprint, Rewrite Architect plan, materialized context packet, adjacent chapter summaries, accepted prior revisions, locked passages, Critic priorities, and local paragraph context.",
          created_by: user.id,
          started_at: status === "running" ? startedAt : null,
        })
        .select("id")
        .single();
      if (jobError) throw jobError;
      jobId = job.id;
      jobStatus = status;

      if (body.serverManaged) {
        return NextResponse.json({
          content: {
            jobId,
            revisionJobId: jobId,
            queued: true,
            totalUnits: body.maxUnits || expectedCalls,
          },
        });
      }
    }

    if (jobStatus !== "running") {
      const { error: resumeError } = await supabase
        .from("revision_jobs")
        .update({ status: "running", started_at: startedAt })
        .eq("id", jobId)
        .eq("book_id", bookId)
        .eq("created_by", user.id);
      if (resumeError) throw resumeError;
    }

    if (body.campaignId) {
      const { error: campaignStartError } = await supabase
        .from("rewrite_campaigns")
        .update({
          status: "running",
          last_revision_job_id: jobId,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", body.campaignId)
        .eq("book_id", bookId);
      if (campaignStartError) throw campaignStartError;
    }

    let attempted = 0;
    let rewritten = 0;
    let failed = 0;
    let skipped = 0;
    let skippedExistingDrafts = 0;
    let skippedAccepted = 0;
    let jobSettings: unknown = {
      model,
      rewriteModelSelection: rewriteSelection,
      maxUnits: body.maxUnits || null,
      campaignId: body.campaignId || null,
      rewriteExistingDrafts: body.rewriteExistingDrafts,
      rewriteAccepted: body.rewriteAccepted,
      distributeAcrossChapters: body.distributeAcrossChapters,
      coverageMode: body.coverageMode,
      strategyId: rewriteStrategy.id,
      strategyLabel: rewriteStrategy.label,
      strategySettings: rewriteStrategy.settings,
      authorInstructions: body.authorInstructions || null,
      unit: "paragraph",
    };
    const { pendingDraftParagraphIds, acceptedParagraphIds } = getExistingRevisionState(
      (existingRevisions || []) as ExistingRevisionRow[],
    );
    const anyRevisionParagraphIds = new Set(
      ((existingRevisions || []) as ExistingRevisionRow[]).map((revision) => revision.paragraph_id).filter(Boolean),
    );
    const retryParagraphIds = body.retryJobId ? await getRetryParagraphIds(supabase, body.retryJobId) : null;
    const warnings: unknown[] = [];
    const eligibleByChapter: RewriteUnit[][] = [];

    for (const [chapterIndex, chapter] of ((chapters || []) as ChapterRow[]).entries()) {
      if (chapter.exclude_from_rewrite) {
        continue;
      }
      if (body.chapterId && chapter.id !== body.chapterId) {
        continue;
      }
      const { data: paragraphs, error: paragraphsError } = await supabase
        .from("paragraphs")
        .select("id,paragraph_number,original_text,accepted_text,is_locked,scene_id")
        .eq("chapter_id", chapter.id)
        .order("paragraph_number");
      if (paragraphsError) throw paragraphsError;

      const rows = (paragraphs || []) as ParagraphRow[];
      if (body.coverageMode === "uncovered_chapter_sample" && rows.some((paragraph) => anyRevisionParagraphIds.has(paragraph.id))) {
        continue;
      }
      const chapterUnits: RewriteUnit[] = [];
      for (const [paragraphIndex, paragraph] of rows.entries()) {
        if (body.paragraphId && paragraph.id !== body.paragraphId) {
          continue;
        }
        if (retryParagraphIds && !retryParagraphIds.has(paragraph.id)) {
          continue;
        }
        if (paragraph.is_locked || shouldSkipParagraph(paragraph.original_text, chapter.title)) {
          skipped += 1;
          continue;
        }
        if (!body.rewriteExistingDrafts && pendingDraftParagraphIds.has(paragraph.id)) {
          skipped += 1;
          skippedExistingDrafts += 1;
          continue;
        }
        if (!body.rewriteAccepted && acceptedParagraphIds.has(paragraph.id)) {
          skipped += 1;
          skippedAccepted += 1;
          continue;
        }

        chapterUnits.push({ chapter, chapterIndex, paragraph, paragraphIndex, rows });
      }
      if (chapterUnits.length) eligibleByChapter.push(chapterUnits);
      if (body.paragraphId && chapterUnits.length > 0) break;
    }

    const eligibleUnits = limitEligibleUnits(
      body.distributeAcrossChapters ? roundRobinUnits(eligibleByChapter) : eligibleByChapter.flat(),
      body.maxUnits,
    );
    attempted = 0;
    jobSettings = await updateRevisionJobProgress(supabase, jobId, jobSettings, {
      taskName: "Full-book rewrite draft",
      currentUnit: eligibleUnits.length ? `Rewrite unit 1 of ${eligibleUnits.length}` : "No eligible units",
      totalUnits: eligibleUnits.length,
      attempted: 0,
      successful: 0,
      failed: 0,
      skipped,
      startedAt,
      estimatedSecondsPerUnit: estimateSecondsPerRewriteUnit(model),
      message:
        skipped > 0
          ? `Skipped ${skipped} locked, title-only, existing-draft, or accepted paragraph(s) before the run.`
          : null,
    });

    // Model calls (the network-bound, slow part) run CONCURRENCY-at-a-time within
    // each chunk via Promise.allSettled. Everything that touches shared state —
    // counters, the revision_versions insert, and the job's progress row — happens
    // afterward in a plain sequential loop over that chunk's settled results, so
    // there's never more than one writer touching jobSettings/failedUnitsLog at once.
    const CONCURRENCY = 5;
    const failedUnitsLog: Array<{ id: string; type: "paragraph"; label: string; error: string }> = [];
    let hardError: unknown = null;

    async function runUnit(unit: RewriteUnit) {
      const { chapter, chapterIndex, paragraph, paragraphIndex, rows } = unit;
      const contextPacket = buildRewriteContextPacket({
        manuscriptBlueprint: bible?.content,
        rewritePlan: normalizedRewritePlan,
        dialogDensity: book?.dialog_density,
        chapter,
        previousChapterSummary: ((chapters || []) as ChapterRow[])[chapterIndex - 1]?.summary,
        nextChapterSummary: ((chapters || []) as ChapterRow[])[chapterIndex + 1]?.summary,
        paragraph,
        rows,
        paragraphIndex,
        criticReports: (criticReports || []) as Array<{
          report_type: string;
          content: Record<string, unknown> | null;
          created_at?: string | null;
        }>,
        lockedPassages: (lockedPassageRows || []) as LockedPassageContextRow[],
        acceptedRevisions: (acceptedRevisionRows || []) as AcceptedRevisionContextRow[],
        continuityLedger: (continuityLedger?.content as Record<string, unknown> | null) || null,
      });
      const prompt = buildFullBookRewriteUnitPrompt({
        manuscriptBlueprint: bible?.content,
        rewritePlan: normalizedRewritePlan,
        contextPacket,
        chapterTitle: chapter.title || `Chapter ${chapter.chapter_number}`,
        chapterSummary: chapter.summary,
        previousChapterSummary: ((chapters || []) as ChapterRow[])[chapterIndex - 1]?.summary,
        nextChapterSummary: ((chapters || []) as ChapterRow[])[chapterIndex + 1]?.summary,
        previousParagraph: rows[paragraphIndex - 1]?.original_text,
        nextParagraph: rows[paragraphIndex + 1]?.original_text,
        rewriteStrategy,
        authorInstructions: body.authorInstructions,
        voiceProfile: (bible as { voice_profile?: unknown } | null)?.voice_profile,
        paragraphNumber: paragraph.paragraph_number,
        text: paragraph.original_text,
      });

      const maxCompletionAttempts = 3;
      let parsed: unknown = null;
      let revisedText = "";
      for (let completionAttempt = 1; completionAttempt <= maxCompletionAttempts; completionAttempt += 1) {
        const completion = await createManagedChatCompletion(
          client,
          preparedModel,
          {
            temperature: Math.min(settings.temperature, 0.55),
            top_p: settings.topP,
            max_tokens: 1800,
            messages: [{ role: "user", content: prompt }],
          },
          undefined,
          telemetryContext,
        );
        parsed = parseRewriteResponse(completion.choices[0]?.message.content || "{}");
        revisedText = extractRevisedText(parsed);
        if (revisedText) break;
      }

      return { unit, parsed, revisedText, emptyCompletionAttempts: maxCompletionAttempts };
    }

    for (let chunkStart = 0; chunkStart < eligibleUnits.length; ) {
      if (hardError) break;
      const pauseStatus = await waitWhileRevisionJobPaused(supabase, jobId);
      if (pauseStatus === "cancelled") break;
      const currentStatus = await getRevisionJobStatus(supabase, jobId);
      if (currentStatus === "cancelled") break;

      // Never let a chunk span two chapters: chapters are rewritten strictly one
      // after another (chapter N fully finishes before N+1 starts) to preserve
      // paragraph-to-paragraph and chapter-to-chapter drift/consistency. Only
      // paragraphs within the same chapter are ever run concurrently.
      const chunkStartIndex = chunkStart;
      const chunk = [eligibleUnits[chunkStartIndex]];
      while (
        chunk.length < CONCURRENCY &&
        chunkStartIndex + chunk.length < eligibleUnits.length &&
        eligibleUnits[chunkStartIndex + chunk.length].chapter.id === chunk[0].chapter.id
      ) {
        chunk.push(eligibleUnits[chunkStartIndex + chunk.length]);
      }
      chunkStart += chunk.length;
      const heartbeat = createRevisionJobHeartbeat(supabase, jobId, jobSettings, {
        currentUnit: `Rewrite units ${chunkStartIndex + 1}-${chunkStartIndex + chunk.length} of ${eligibleUnits.length}`,
        totalUnits: eligibleUnits.length,
        attempted,
        successful: rewritten,
        failed,
        skipped,
      });
      const settled = await Promise.allSettled(chunk.map((unit) => runUnit(unit)));
      heartbeat.stop();

      for (const [chunkIndex, result] of settled.entries()) {
        const unit = chunk[chunkIndex];
        const { chapter, paragraph } = unit;
        const unitLabel = `chapter ${chapter.chapter_number}, paragraph ${paragraph.paragraph_number}`;
        attempted += 1;

        if (result.status === "rejected") {
          failed += 1;
          const message = getErrorMessage(result.reason);
          failedUnitsLog.push({ id: paragraph.id, type: "paragraph", label: `Chapter ${chapter.chapter_number}, paragraph ${paragraph.paragraph_number}`, error: message });
          hardError = hardError || result.reason;
          jobSettings = await updateRevisionJobProgress(supabase, jobId, jobSettings, {
            currentUnit: `Failed at ${unitLabel}`,
            totalUnits: eligibleUnits.length,
            attempted,
            successful: rewritten,
            failed,
            skipped,
            message,
            failedUnits: failedUnitsLog,
          });
          break;
        }

        const { parsed, revisedText, emptyCompletionAttempts } = result.value;
        if (!revisedText) {
          failed += 1;
          const message = `Model returned an empty completion after ${emptyCompletionAttempts} attempt(s); paragraph left untouched.`;
          failedUnitsLog.push({ id: paragraph.id, type: "paragraph", label: `Chapter ${chapter.chapter_number}, paragraph ${paragraph.paragraph_number}`, error: message });
          jobSettings = await updateRevisionJobProgress(supabase, jobId, jobSettings, {
            currentUnit: `Empty completion at ${unitLabel}`,
            totalUnits: eligibleUnits.length,
            attempted,
            successful: rewritten,
            failed,
            skipped,
            message,
            failedUnits: failedUnitsLog,
          });
          continue;
        }

        const continuityWarnings = extractArray(parsed, "continuityWarnings");
        const { error: versionError } = await supabase.from("revision_versions").insert({
          revision_job_id: jobId,
          book_id: bookId,
          chapter_id: chapter.id,
          scene_id: paragraph.scene_id,
          paragraph_id: paragraph.id,
          original_text: paragraph.original_text,
          revised_text: revisedText,
          revision_notes: extractString(parsed, "revisionNotes") || "Full-book rewrite draft.",
          continuity_warnings: continuityWarnings,
        });
        if (versionError) {
          failed += 1;
          const message = getErrorMessage(versionError);
          failedUnitsLog.push({ id: paragraph.id, type: "paragraph", label: `Chapter ${chapter.chapter_number}, paragraph ${paragraph.paragraph_number}`, error: message });
          hardError = hardError || versionError;
          jobSettings = await updateRevisionJobProgress(supabase, jobId, jobSettings, {
            currentUnit: `Failed to save ${unitLabel}`,
            totalUnits: eligibleUnits.length,
            attempted,
            successful: rewritten,
            failed,
            skipped,
            message,
            failedUnits: failedUnitsLog,
          });
          break;
        }

        rewritten += 1;
        warnings.push(...continuityWarnings);
        jobSettings = await updateRevisionJobProgress(supabase, jobId, jobSettings, {
          currentUnit:
            attempted >= eligibleUnits.length
              ? "Finalizing rewrite job"
              : `Rewrite unit ${attempted + 1} of ${eligibleUnits.length}`,
          totalUnits: eligibleUnits.length,
          attempted,
          successful: rewritten,
          failed,
          skipped,
          failedUnits: failedUnitsLog,
        });
      }
    }

    if (hardError) throw hardError;

    const completedAt = new Date().toISOString();
    const finalStatus = await getRevisionJobStatus(supabase, jobId);
    const completedStatus = finalStatus === "cancelled" ? "cancelled" : "completed";
    const { error: updateError } = await supabase
      .from("revision_jobs")
      .update({
        status: completedStatus,
        completed_at: completedAt,
        settings: {
          model,
          campaignId: body.campaignId || null,
          rewriteModelSelection: rewriteSelection,
          maxUnits: body.maxUnits || null,
          rewriteExistingDrafts: body.rewriteExistingDrafts,
          rewriteAccepted: body.rewriteAccepted,
          distributeAcrossChapters: body.distributeAcrossChapters,
          coverageMode: body.coverageMode,
          strategyId: rewriteStrategy.id,
          strategyLabel: rewriteStrategy.label,
          strategySettings: rewriteStrategy.settings,
          authorInstructions: body.authorInstructions || null,
          unit: "paragraph",
          attempted,
          rewritten,
          failed,
          skipped,
          skippedExistingDrafts,
          skippedAccepted,
          retryJobId: body.retryJobId || null,
          warningCount: warnings.length,
          progress: buildJobProgress({
            taskName: "Full-book rewrite draft",
            currentUnit: completedStatus === "cancelled" ? "Cancelled" : "Complete",
            totalUnits: eligibleUnits.length,
            attempted,
            successful: rewritten,
            failed,
            skipped,
            failedUnits: failedUnitsLog,
            startedAt,
            completedAt,
            estimatedSecondsPerUnit: estimateSecondsPerRewriteUnit(model),
            message:
              completedStatus === "cancelled"
                ? "The rewrite was cancelled. Saved revision versions remain available for review."
                : "Rewrite draft versions saved. Review, accept, reject, or rerun selected paragraphs.",
          }),
        },
      })
      .eq("id", jobId);
    if (updateError) throw updateError;

    if (body.campaignId) {
      const campaignStats = await getCampaignStats(supabase, bookId);
      const { data: campaign } = await supabase
        .from("rewrite_campaigns")
        .select("goal,batches_run")
        .eq("id", body.campaignId)
        .eq("book_id", bookId)
        .maybeSingle();
      const campaignComplete = campaign
        ? isCampaignComplete(String(campaign.goal || "full_coverage"), campaignStats)
        : false;
      const { error: campaignUpdateError } = await supabase
        .from("rewrite_campaigns")
        .update({
          status: completedStatus === "cancelled" ? "cancelled" : campaignComplete ? "completed" : "active",
          total_paragraphs: campaignStats.totalParagraphs,
          untouched_paragraphs: campaignStats.untouchedParagraphs,
          pending_draft_paragraphs: campaignStats.pendingDraftParagraphs,
          accepted_paragraphs: campaignStats.acceptedParagraphs,
          sampled_chapters: campaignStats.sampledChapters,
          fully_covered_chapters: campaignStats.fullyCoveredChapters,
          total_chapters: campaignStats.totalChapters,
          batches_run: Number(campaign?.batches_run || 0) + 1,
          last_revision_job_id: jobId,
          completed_at: campaignComplete || completedStatus === "cancelled" ? completedAt : null,
          updated_at: completedAt,
        })
        .eq("id", body.campaignId)
        .eq("book_id", bookId);
      if (campaignUpdateError) throw campaignUpdateError;
    }

    await supabase.from("coherence_reports").insert({
      book_id: bookId,
      report_type: "rewrite_execution",
      content: {
        revisionJobId: jobId,
        model,
        attempted,
        rewritten,
        failed,
        skipped,
        skippedExistingDrafts,
        skippedAccepted,
        continuityWarnings: warnings.slice(0, 100),
        startedAt,
        completedAt,
        nextStep: "Review revision versions, accept or reject changes, then rerun all BookForge Critic lenses.",
      },
    });

    return NextResponse.json({
      content: {
        revisionJobId: jobId,
        model,
        attempted,
        rewritten,
        failed,
        skipped,
        skippedExistingDrafts,
        skippedAccepted,
        continuityWarningCount: warnings.length,
        status: completedStatus,
      },
    });
  } catch (error) {
    console.error("Rewrite execution failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

type RewriteUnit = {
  chapter: ChapterRow;
  chapterIndex: number;
  paragraph: ParagraphRow;
  paragraphIndex: number;
  rows: ParagraphRow[];
};

function roundRobinUnits(groups: RewriteUnit[][]) {
  const output: RewriteUnit[] = [];
  const maxLength = Math.max(0, ...groups.map((group) => group.length));
  for (let index = 0; index < maxLength; index += 1) {
    for (const group of groups) {
      const unit = group[index];
      if (unit) output.push(unit);
    }
  }
  return output;
}

function limitEligibleUnits(units: RewriteUnit[], maxUnits?: number) {
  return maxUnits ? units.slice(0, maxUnits) : units;
}

async function getRetryParagraphIds(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  jobId: string,
) {
  const { data, error } = await supabase.from("revision_jobs").select("settings").eq("id", jobId).single();
  if (error) throw error;
  const settings = data.settings as RetryJobSettings | null;
  const ids = (settings?.progress?.failedUnits || [])
    .filter((unit) => unit.type === "paragraph" && unit.id)
    .map((unit) => String(unit.id));
  return ids.length ? new Set(ids) : new Set<string>();
}

function estimateSecondsPerRewriteUnit(model: string) {
  const lower = model.toLowerCase();
  if (/(70b|72b)/.test(lower)) return 55;
  if (/(30b|32b|34b)/.test(lower)) return 32;
  if (/(14b|13b)/.test(lower)) return 20;
  if (/(7b|8b)/.test(lower)) return 12;
  return 24;
}

function getExistingRevisionState(revisions: ExistingRevisionRow[]) {
  const pendingDraftParagraphIds = new Set<string>();
  const acceptedParagraphIds = new Set<string>();

  revisions.forEach((revision) => {
    if (!revision.paragraph_id) return;
    if (revision.accepted) {
      acceptedParagraphIds.add(revision.paragraph_id);
      return;
    }
    if (!revision.rejected) {
      pendingDraftParagraphIds.add(revision.paragraph_id);
    }
  });

  return { pendingDraftParagraphIds, acceptedParagraphIds };
}

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function shouldSkipParagraph(text: string, title: string | null) {
  const clean = text.trim();
  const words = clean.split(/\s+/).filter(Boolean).length;
  if (words < 8) return true;
  if (title && clean.toLowerCase() === title.trim().toLowerCase()) return true;
  return false;
}

function parseRewriteResponse(content: string) {
  return parseModelJsonOrFallback(content, (raw, parseError) => ({
    revisedText: raw,
    revisionNotes: `Model returned malformed JSON: ${parseError}`,
    continuityWarnings: [],
    ledgerUpdates: [],
    confidence: 0,
  }));
}

function extractRevisedText(parsed: unknown) {
  return parsed && typeof parsed === "object" && typeof (parsed as Record<string, unknown>).revisedText === "string"
    ? String((parsed as Record<string, unknown>).revisedText).trim()
    : "";
}

function extractString(parsed: unknown, key: string) {
  return parsed && typeof parsed === "object" && typeof (parsed as Record<string, unknown>)[key] === "string"
    ? String((parsed as Record<string, unknown>)[key])
    : "";
}

function extractArray(parsed: unknown, key: string) {
  return parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>)[key])
    ? ((parsed as Record<string, unknown>)[key] as unknown[])
    : [];
}

async function getCampaignStats(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  bookId: string,
) {
  const [
    { count: paragraphCount },
    { data: chapters, error: chaptersError },
    { data: paragraphs, error: paragraphsError },
    { data: pendingDrafts, error: pendingError },
    { data: acceptedDrafts, error: acceptedError },
    { data: revisionRows, error: revisionError },
  ] = await Promise.all([
    supabase.from("paragraphs").select("id", { count: "exact", head: true }).eq("book_id", bookId),
    supabase.from("chapters").select("id").eq("book_id", bookId),
    supabase.from("paragraphs").select("id,chapter_id").eq("book_id", bookId),
    supabase
      .from("revision_versions")
      .select("paragraph_id")
      .eq("book_id", bookId)
      .eq("accepted", false)
      .eq("rejected", false)
      .not("paragraph_id", "is", null),
    supabase
      .from("revision_versions")
      .select("paragraph_id")
      .eq("book_id", bookId)
      .eq("accepted", true)
      .not("paragraph_id", "is", null),
    supabase
      .from("revision_versions")
      .select("paragraph_id")
      .eq("book_id", bookId)
      .not("paragraph_id", "is", null),
  ]);
  if (chaptersError) throw chaptersError;
  if (paragraphsError) throw paragraphsError;
  if (pendingError) throw pendingError;
  if (acceptedError) throw acceptedError;
  if (revisionError) throw revisionError;

  const pendingDraftParagraphCount = new Set((pendingDrafts || []).map((row) => row.paragraph_id).filter(Boolean)).size;
  const acceptedParagraphCount = new Set((acceptedDrafts || []).map((row) => row.paragraph_id).filter(Boolean)).size;
  const paragraphIdsWithRevisions = new Set((revisionRows || []).map((row) => row.paragraph_id).filter(Boolean));
  const paragraphsByChapter = (paragraphs || []).reduce<Record<string, Array<{ id: string }>>>((groups, paragraph) => {
    groups[paragraph.chapter_id] ||= [];
    groups[paragraph.chapter_id].push(paragraph);
    return groups;
  }, {});
  const coverage = (chapters || []).map((chapter) => {
    const chapterParagraphs = paragraphsByChapter[chapter.id] || [];
    return {
      totalParagraphs: chapterParagraphs.length,
      rewrittenParagraphs: chapterParagraphs.filter((paragraph) => paragraphIdsWithRevisions.has(paragraph.id)).length,
    };
  });
  const totalChapters = coverage.filter((chapter) => chapter.totalParagraphs > 0).length;
  const sampledChapters = coverage.filter((chapter) => chapter.rewrittenParagraphs > 0).length;
  const fullyCoveredChapters = coverage.filter(
    (chapter) => chapter.totalParagraphs > 0 && chapter.rewrittenParagraphs >= chapter.totalParagraphs,
  ).length;
  const totalParagraphs = paragraphCount || 0;

  return {
    totalParagraphs,
    untouchedParagraphs: Math.max(0, totalParagraphs - pendingDraftParagraphCount - acceptedParagraphCount),
    pendingDraftParagraphs: pendingDraftParagraphCount,
    acceptedParagraphs: acceptedParagraphCount,
    sampledChapters,
    fullyCoveredChapters,
    totalChapters,
  };
}

function isCampaignComplete(goal: string, stats: Awaited<ReturnType<typeof getCampaignStats>>) {
  if (goal === "sample_all_chapters") {
    return stats.totalChapters > 0 && stats.sampledChapters >= stats.totalChapters;
  }
  if (goal === "full_coverage") {
    return stats.totalParagraphs > 0 && stats.untouchedParagraphs <= 0;
  }
  return false;
}
