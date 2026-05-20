import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { markBookRevising } from "@/lib/books/status";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  action: z.enum(["preview", "run"]).default("preview"),
  trustProfile: z.enum(["careful", "balanced", "full_trust"]).default("full_trust"),
  maxDecisions: z.number().int().positive().max(5000).default(5000),
});

type RevisionRow = {
  id: string;
  book_id: string;
  chapter_id: string | null;
  scene_id: string | null;
  paragraph_id: string | null;
  original_text: string;
  revised_text: string;
  revision_notes: string | null;
  continuity_warnings: unknown;
  created_at: string | null;
};

type ParagraphRow = {
  id: string;
  is_locked: boolean | null;
};

type AutoDecision = {
  revisionVersionId: string;
  paragraphId: string;
  action: "accept" | "reject" | "redo";
  confidence: number;
  roll: number;
  risk: "low" | "medium" | "high";
  reason: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Auto revision failed.";
}

export async function POST(request: Request, context: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await context.params;
    const body = schema.parse(await readJsonBody(request));
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const [{ data: book, error: bookError }, { data: revisions, error: revisionsError }] = await Promise.all([
      supabase.from("books").select("id,title").eq("id", bookId).single(),
      supabase
        .from("revision_versions")
        .select("id,book_id,chapter_id,scene_id,paragraph_id,original_text,revised_text,revision_notes,continuity_warnings,created_at")
        .eq("book_id", bookId)
        .eq("accepted", false)
        .eq("rejected", false)
        .not("paragraph_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(5000),
    ]);
    if (bookError) throw bookError;
    if (revisionsError) throw revisionsError;
    if (!book) return NextResponse.json({ error: "Book not found." }, { status: 404 });

    const latestRevisions = latestRevisionPerParagraph((revisions || []) as RevisionRow[]).slice(0, body.maxDecisions);
    const paragraphIds = latestRevisions.map((revision) => revision.paragraph_id).filter(Boolean) as string[];
    const { data: paragraphRows, error: paragraphError } = paragraphIds.length
      ? await supabase.from("paragraphs").select("id,is_locked").in("id", paragraphIds)
      : { data: [], error: null };
    if (paragraphError) throw paragraphError;

    const lockedParagraphIds = new Set(
      ((paragraphRows || []) as ParagraphRow[]).filter((paragraph) => paragraph.is_locked).map((paragraph) => paragraph.id),
    );
    const decisions = latestRevisions
      .filter((revision) => revision.paragraph_id && !lockedParagraphIds.has(revision.paragraph_id))
      .map((revision) => buildDecision(revision, body.trustProfile));
    const skippedLocked = latestRevisions.length - decisions.length;

    if (body.action === "preview") {
      return NextResponse.json({
        content: {
          bookId,
          pendingDrafts: (revisions || []).length,
          considered: latestRevisions.length,
          skippedLocked,
          decisions: summarizeDecisions(decisions),
          sample: decisions.slice(0, 8),
          nextStep: getAutoNextStep(decisions),
        },
      });
    }

    const { data: job, error: jobError } = await supabase
      .from("revision_jobs")
      .insert({
        book_id: bookId,
        mode: "auto_revision",
        status: "running",
        settings: {
          trustProfile: body.trustProfile,
          maxDecisions: body.maxDecisions,
          pendingDrafts: (revisions || []).length,
          considered: latestRevisions.length,
          skippedLocked,
        },
        prompt_snapshot:
          "Auto Revision applies weighted, auditable accept/reject/redo decisions to pending draft revisions while preserving locked passages and continuity warnings.",
        created_by: user.id,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (jobError) throw jobError;

    const applied = await applyDecisions(supabase, decisions);
    const completedAt = new Date().toISOString();
    const summary = summarizeDecisions(decisions);
    const nextStep = getAutoNextStep(decisions);

    const { error: reportError } = await supabase.from("coherence_reports").insert({
      book_id: bookId,
      report_type: "auto_revision_decisions",
      content: {
        event: "auto_revision_decision_batch",
        trustProfile: body.trustProfile,
        randomSeed: randomUUID(),
        completedAt,
        summary,
        skippedLocked,
        nextStep,
        decisions,
        note:
          "Auto Revision made weighted random decisions. Accepted drafts became active paragraph text; rejected and redo drafts remain auditable in revision history. Locked passages were skipped.",
      },
    });
    if (reportError) throw reportError;

    const { error: jobUpdateError } = await supabase
      .from("revision_jobs")
      .update({
        status: "completed",
        completed_at: completedAt,
        settings: {
          trustProfile: body.trustProfile,
          maxDecisions: body.maxDecisions,
          pendingDrafts: (revisions || []).length,
          considered: latestRevisions.length,
          skippedLocked,
          applied,
          summary,
          nextStep,
        },
      })
      .eq("id", job.id);
    if (jobUpdateError) throw jobUpdateError;

    await markBookRevising(supabase, bookId);

    return NextResponse.json({
      content: {
        jobId: job.id,
        applied,
        skippedLocked,
        decisions: summary,
        nextStep,
      },
    });
  } catch (error) {
    console.error("Auto revision failed", error);
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

function latestRevisionPerParagraph(revisions: RevisionRow[]) {
  const latest = new Map<string, RevisionRow>();
  for (const revision of revisions) {
    if (!revision.paragraph_id || latest.has(revision.paragraph_id)) continue;
    latest.set(revision.paragraph_id, revision);
  }
  return Array.from(latest.values());
}

function buildDecision(revision: RevisionRow, trustProfile: "careful" | "balanced" | "full_trust"): AutoDecision {
  const risk = assessRisk(revision);
  const roll = Math.random();
  const thresholds = getThresholds(trustProfile, risk);
  const action = roll < thresholds.accept ? "accept" : roll < thresholds.accept + thresholds.redo ? "redo" : "reject";
  const confidence = Math.max(0.05, Math.min(0.98, thresholds.accept - riskPenalty(risk) + roll / 8));

  return {
    revisionVersionId: revision.id,
    paragraphId: revision.paragraph_id || "",
    action,
    confidence: Number(confidence.toFixed(2)),
    roll: Number(roll.toFixed(4)),
    risk,
    reason: buildReason(action, risk, revision),
  };
}

function getThresholds(trustProfile: "careful" | "balanced" | "full_trust", risk: AutoDecision["risk"]) {
  const profile =
    trustProfile === "careful"
      ? { accept: 0.55, redo: 0.3 }
      : trustProfile === "balanced"
        ? { accept: 0.7, redo: 0.2 }
        : { accept: 0.82, redo: 0.13 };
  if (risk === "high") return { accept: Math.max(0.12, profile.accept - 0.48), redo: Math.min(0.55, profile.redo + 0.26) };
  if (risk === "medium") return { accept: Math.max(0.25, profile.accept - 0.22), redo: Math.min(0.42, profile.redo + 0.12) };
  return profile;
}

function assessRisk(revision: RevisionRow): AutoDecision["risk"] {
  const warningText = JSON.stringify(revision.continuity_warnings || []).toLowerCase();
  const notes = (revision.revision_notes || "").toLowerCase();
  if (/critical|high|contradict|changed fact|renamed|timeline|worldview|theology|continuity break/.test(warningText)) {
    return "high";
  }
  if (/warning|watch|possible|verify|continuity|drift/.test(warningText) || /verify|concern|risk/.test(notes)) {
    return "medium";
  }
  const originalLength = revision.original_text.trim().length;
  const revisedLength = revision.revised_text.trim().length;
  if (originalLength > 0) {
    const ratio = revisedLength / originalLength;
    if (ratio < 0.45 || ratio > 1.9) return "medium";
  }
  return "low";
}

function riskPenalty(risk: AutoDecision["risk"]) {
  if (risk === "high") return 0.28;
  if (risk === "medium") return 0.12;
  return 0;
}

function buildReason(action: AutoDecision["action"], risk: AutoDecision["risk"], revision: RevisionRow) {
  const warningCount = Array.isArray(revision.continuity_warnings) ? revision.continuity_warnings.length : 0;
  if (action === "accept") {
    return risk === "low"
      ? "Accepted by full-trust weighted review; no strong continuity warning was detected."
      : "Accepted despite some risk because the weighted review favored progress. Audit before final export.";
  }
  if (action === "redo") {
    return warningCount
      ? `Redo requested because ${warningCount} continuity warning(s) made this draft less trustworthy.`
      : "Redo requested by weighted review to sample an alternate rewrite.";
  }
  return risk === "high"
    ? "Rejected because continuity or purpose drift risk was high."
    : "Rejected by weighted review to preserve variety and avoid overtrusting every draft.";
}

async function applyDecisions(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  decisions: AutoDecision[],
) {
  let accepted = 0;
  let rejected = 0;
  let redo = 0;

  for (const decision of decisions) {
    const { data: version, error: versionError } = await supabase
      .from("revision_versions")
      .select("id,book_id,paragraph_id,revised_text")
      .eq("id", decision.revisionVersionId)
      .single();
    if (versionError) throw versionError;
    if (!version?.paragraph_id) continue;

    if (decision.action === "accept") {
      const { error: clearError } = await supabase
        .from("revision_versions")
        .update({ accepted: false })
        .eq("paragraph_id", version.paragraph_id)
        .eq("book_id", version.book_id);
      if (clearError) throw clearError;

      const { error: paragraphError } = await supabase
        .from("paragraphs")
        .update({
          accepted_text: version.revised_text,
          current_text: version.revised_text,
          updated_at: new Date().toISOString(),
        })
        .eq("id", version.paragraph_id);
      if (paragraphError) throw paragraphError;

      const { error: acceptError } = await supabase
        .from("revision_versions")
        .update({ accepted: true, rejected: false })
        .eq("id", version.id);
      if (acceptError) throw acceptError;
      accepted += 1;
      continue;
    }

    const { error: rejectError } = await supabase
      .from("revision_versions")
      .update({ accepted: false, rejected: true })
      .eq("id", version.id);
    if (rejectError) throw rejectError;
    if (decision.action === "redo") redo += 1;
    else rejected += 1;
  }

  return { accepted, rejected, redo };
}

function summarizeDecisions(decisions: AutoDecision[]) {
  return decisions.reduce(
    (summary, decision) => {
      summary.total += 1;
      summary[decision.action] += 1;
      summary[decision.risk] += 1;
      return summary;
    },
    { total: 0, accept: 0, reject: 0, redo: 0, low: 0, medium: 0, high: 0 },
  );
}

function getAutoNextStep(decisions: AutoDecision[]) {
  const summary = summarizeDecisions(decisions);
  if (summary.high > 0 || summary.redo >= Math.max(3, Math.ceil(summary.total * 0.2))) {
    return "Run another rewrite batch for redo/rejected passages, then run drift check before broad acceptance.";
  }
  if (summary.accept >= Math.max(10, Math.ceil(summary.total * 0.75))) {
    return "Acceptance was strong. Continue to drift check or post-rewrite Critic once coverage is high enough.";
  }
  return "Continue with another rewrite pass for rejected/redo passages before final quality gates.";
}
