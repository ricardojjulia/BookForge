import { NextResponse } from "next/server";
import { z } from "zod";
import {
  buildJobProgress,
  createRevisionJobHeartbeat,
  getRevisionJobStatus,
  updateRevisionJobProgress,
  waitWhileRevisionJobPaused,
} from "@/lib/ai/job-state";
import { createManagedChatCompletion } from "@/lib/lmstudio/client";
import { getLmStudioErrorMessage } from "@/lib/lmstudio/errors";
import { parseModelJsonOrFallback } from "@/lib/lmstudio/json";
import { getExtractionModelCandidates } from "@/lib/lmstudio/model-selection";
import { selectAndPrepareActiveModel } from "@/lib/lmstudio/orchestrator";
import { getUserLmStudioSettings } from "@/lib/lmstudio/settings";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  chapterIds: z.array(z.string().uuid()).min(1).max(5),
  jobId: z.string().uuid().optional(),
  serverManaged: z.boolean().optional(),
});

const VOICE_CAPTURE_PROMPT = (sampleText: string) => `You are a literary voice analyst. Analyze the following manuscript sample and extract a precise voice profile that can be used to guide AI rewriting to match this author's style.

MANUSCRIPT SAMPLE:
${sampleText}

Analyze and return a JSON object with these fields:
{
  "sentenceStyle": "description of typical sentence length, rhythm, and structure",
  "paragraphStructure": "how paragraphs are typically built — length, beat patterns, white space use",
  "dialogueStyle": "how dialogue is written — attribution style, beats, internal thought integration",
  "vocabularyRegister": "word choice level — literary/colloquial/technical, any distinctive patterns",
  "narrativeTone": "emotional register, distance, warmth, irony level",
  "paceSignature": "how pace is controlled — action density, reflection ratio, scene length",
  "distinctivePatterns": ["list of specific recurring stylistic choices or habits"],
  "avoidList": ["things that would break this voice — patterns the author never uses"],
  "rewriteInstruction": "one clear paragraph an AI rewriter should internalize to match this voice"
}

Return ONLY the JSON object.`;

export async function POST(request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await params;
    const body = schema.parse(await request.json());
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: book } = await supabase.from("books").select("id").eq("id", bookId).eq("owner_id", user.id).single();
    if (!book) return NextResponse.json({ error: "Book not found." }, { status: 404 });

    const startedAt = new Date().toISOString();
    const totalUnits = 1;
    let durableJobId = body.jobId || "";
    let durableJobStatus = "running";
    let durableSettings: unknown = {
      chapterIds: body.chapterIds,
      unit: "voice_capture",
      progress: buildJobProgress({
        taskName: "Capture author voice profile",
        currentUnit: "Preparing selected chapter samples",
        totalUnits,
        attempted: 1,
        successful: 0,
        failed: 0,
        skipped: 0,
        startedAt,
        estimatedSecondsPerUnit: 20,
      }),
    };

    if (durableJobId) {
      const { data: existingJob, error: existingJobError } = await supabase
        .from("revision_jobs")
        .select("id,status,settings")
        .eq("id", durableJobId)
        .eq("book_id", bookId)
        .eq("created_by", user.id)
        .single();
      if (existingJobError) throw existingJobError;
      if (!existingJob) return NextResponse.json({ error: "Voice-capture job not found." }, { status: 404 });
      if (existingJob.status === "completed") return NextResponse.json({ ok: true, message: "Voice-capture job already completed." });
      if (existingJob.status === "failed") return NextResponse.json({ ok: true, message: "Voice-capture job already failed." });
      durableJobStatus = String(existingJob.status || "running");
      durableSettings = existingJob.settings || durableSettings;
    } else {
      const status = body.serverManaged ? "queued" : "running";
      const { data: createdJob, error: createdJobError } = await supabase
        .from("revision_jobs")
        .insert({
          book_id: bookId,
          mode: "voice_capture",
          status,
          settings: {
            chapterIds: body.chapterIds,
            unit: "voice_capture",
            progress: buildJobProgress({
              taskName: "Capture author voice profile",
              currentUnit: status === "queued" ? "Queued" : "Preparing selected chapter samples",
              totalUnits,
              attempted: 1,
              successful: 0,
              failed: 0,
              skipped: 0,
              startedAt: status === "running" ? startedAt : null,
              estimatedSecondsPerUnit: 20,
            }),
          },
          prompt_snapshot: "Voice capture profile extraction",
          created_by: user.id,
          started_at: status === "running" ? startedAt : null,
        })
        .select("id")
        .single();
      if (createdJobError) throw createdJobError;
      durableJobId = createdJob.id;
      durableJobStatus = status;

      if (body.serverManaged) {
        return NextResponse.json({ content: { jobId: durableJobId, queued: true, totalUnits } });
      }
    }

    if (durableJobStatus !== "running") {
      await supabase
        .from("revision_jobs")
        .update({ status: "running", started_at: startedAt })
        .eq("id", durableJobId)
        .eq("book_id", bookId)
        .eq("created_by", user.id);
    }

    const pauseStatus = await waitWhileRevisionJobPaused(supabase, durableJobId);
    if (pauseStatus === "cancelled") {
      const completedAt = new Date().toISOString();
      await supabase
        .from("revision_jobs")
        .update({
          status: "cancelled",
          completed_at: completedAt,
          settings: {
            chapterIds: body.chapterIds,
            unit: "voice_capture",
            progress: buildJobProgress({
              taskName: "Capture author voice profile",
              currentUnit: "Cancelled",
              totalUnits,
              attempted: 0,
              successful: 0,
              failed: 0,
              skipped: 1,
              startedAt,
              completedAt,
              estimatedSecondsPerUnit: 20,
              message: "Voice capture cancelled before execution started.",
            }),
          },
        })
        .eq("id", durableJobId);
      return NextResponse.json({ ok: true, message: "Voice-capture job cancelled." });
    }

    durableSettings = await updateRevisionJobProgress(supabase, durableJobId, durableSettings, {
      currentUnit: "Running voice-profile extraction",
      totalUnits,
      attempted: 1,
      successful: 0,
      failed: 0,
      skipped: 0,
    });

    const heartbeat = createRevisionJobHeartbeat(supabase, durableJobId, durableSettings, {
      currentUnit: "Running voice-profile extraction",
      totalUnits,
      attempted: 1,
      successful: 0,
      failed: 0,
      skipped: 0,
    });

    try {

      const { data: paragraphs } = await supabase
        .from("paragraphs")
        .select("original_text,accepted_text,chapter_id,paragraph_number")
        .eq("book_id", bookId)
        .in("chapter_id", body.chapterIds)
        .order("paragraph_number");

      const sampleText = (paragraphs || [])
        .map((p) => (p.accepted_text || p.original_text || "").trim())
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 18000);

      if (sampleText.length < 200) {
        const completedAt = new Date().toISOString();
        await supabase
          .from("revision_jobs")
          .update({
            status: "failed",
            completed_at: completedAt,
            error_message: "Not enough text in the selected chapters to analyze voice.",
            settings: {
              chapterIds: body.chapterIds,
              unit: "voice_capture",
              progress: buildJobProgress({
                taskName: "Capture author voice profile",
                currentUnit: "Failed",
                totalUnits,
                attempted: 1,
                successful: 0,
                failed: 1,
                skipped: 0,
                startedAt,
                completedAt,
                estimatedSecondsPerUnit: 20,
                message: "Not enough text in the selected chapters to analyze voice.",
              }),
            },
          })
          .eq("id", durableJobId);
        return NextResponse.json({ error: "Not enough text in the selected chapters to analyze voice." }, { status: 400 });
      }

      const settings = await getUserLmStudioSettings(user.id);
      const modelPlan = await selectAndPrepareActiveModel(settings, {
        task: "extraction",
        candidates: getExtractionModelCandidates(settings),
        expectedCalls: 1,
        latencyPreference: "quality",
      });
      const { client, preparedModel } = modelPlan;

      const completion = await createManagedChatCompletion(client, preparedModel, {
        temperature: 0.3,
        top_p: settings.topP,
        max_tokens: Math.min(settings.maxOutputTokens, 2000),
        messages: [{ role: "user", content: VOICE_CAPTURE_PROMPT(sampleText) }],
      });

      const voiceProfile = parseModelJsonOrFallback(
        completion.choices[0]?.message.content || "{}",
        (raw) => ({ rewriteInstruction: raw, sentenceStyle: "", paragraphStructure: "", dialogueStyle: "", vocabularyRegister: "", narrativeTone: "", paceSignature: "", distinctivePatterns: [], avoidList: [] }),
      );

      const { data: existingBible } = await supabase.from("book_bibles").select("id").eq("book_id", bookId).maybeSingle();
      if (existingBible) {
        await supabase.from("book_bibles").update({ voice_profile: voiceProfile, updated_at: new Date().toISOString() }).eq("book_id", bookId);
      } else {
        await supabase.from("book_bibles").insert({ book_id: bookId, content: {}, voice_profile: voiceProfile });
      }

      const completedAt = new Date().toISOString();
      const finalStatus = await getRevisionJobStatus(supabase, durableJobId);
      const completedStatus = finalStatus === "cancelled" ? "cancelled" : "completed";
      await supabase
        .from("revision_jobs")
        .update({
          status: completedStatus,
          completed_at: completedAt,
          settings: {
            chapterIds: body.chapterIds,
            unit: "voice_capture",
            progress: buildJobProgress({
              taskName: "Capture author voice profile",
              currentUnit: completedStatus === "cancelled" ? "Cancelled" : "Complete",
              totalUnits,
              attempted: 1,
              successful: completedStatus === "cancelled" ? 0 : 1,
              failed: 0,
              skipped: completedStatus === "cancelled" ? 1 : 0,
              startedAt,
              completedAt,
              estimatedSecondsPerUnit: 20,
              message:
                completedStatus === "cancelled"
                  ? "Voice capture cancelled during execution."
                  : "Voice profile captured and saved.",
            }),
          },
        })
        .eq("id", durableJobId);

      return NextResponse.json({ voiceProfile, revisionJobId: durableJobId });
    } catch (runError) {
      const completedAt = new Date().toISOString();
      const message = getLmStudioErrorMessage(runError, "") || (runError instanceof Error ? runError.message : "Failed.");
      await supabase
        .from("revision_jobs")
        .update({
          status: "failed",
          completed_at: completedAt,
          error_message: message,
          settings: {
            chapterIds: body.chapterIds,
            unit: "voice_capture",
            progress: buildJobProgress({
              taskName: "Capture author voice profile",
              currentUnit: "Failed",
              totalUnits,
              attempted: 1,
              successful: 0,
              failed: 1,
              skipped: 0,
              startedAt,
              completedAt,
              estimatedSecondsPerUnit: 20,
              message,
            }),
          },
        })
        .eq("id", durableJobId);
      throw runError;
    } finally {
      heartbeat.stop();
    }
  } catch (error) {
    console.error("voice-capture failed", error);
    const msg = getLmStudioErrorMessage(error, "") || (error instanceof Error ? error.message : "Failed.");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
