import { criticLenses } from "@/lib/critic/prompts";
import { summarizeCriticContent } from "@/lib/critic/summary";
import { describeDialogueDensity } from "@/lib/dialogue-density";
import type { CriticLens } from "@/lib/types";

export type RewriteContextPacketInput = {
  manuscriptBlueprint: unknown;
  rewritePlan: Record<string, unknown>;
  dialogDensity?: string | null;
  chapter: {
    id: string;
    chapter_number: number;
    title: string | null;
    summary: string | null;
  };
  previousChapterSummary?: string | null;
  nextChapterSummary?: string | null;
  paragraph: {
    id: string;
    paragraph_number: number;
    original_text: string;
  };
  rows: Array<{
    id: string;
    paragraph_number: number;
    original_text: string;
    accepted_text?: string | null;
    is_locked?: boolean | null;
  }>;
  paragraphIndex: number;
  criticReports: Array<{
    report_type: string;
    content: Record<string, unknown> | null;
    created_at?: string | null;
  }>;
  lockedPassages: Array<{
    paragraph_id: string | null;
    reason: string | null;
  }>;
  acceptedRevisions: Array<{
    paragraph_id: string | null;
    revised_text: string;
    revision_notes: string | null;
    continuity_warnings: unknown;
    created_at?: string | null;
  }>;
  continuityLedger: Record<string, unknown> | null;
};

export function buildRewriteContextPacket(input: RewriteContextPacketInput) {
  const chapterDirective = getChapterDirective(input.rewritePlan, input.chapter.chapter_number);
  const ledger = input.continuityLedger || objectValue(input.rewritePlan.latestContinuityLedger);
  const acceptedPriorRevisions = getNearbyAcceptedRevisions(input);
  const lockedPassages = getNearbyLockedPassages(input);
  const continuityWarnings = [
    ...arrayValue(ledger.recentWarnings),
    ...acceptedPriorRevisions.flatMap((revision) => arrayValue(revision.continuityWarnings)),
  ].slice(0, 12);

  return {
    globalObjective: stringValue(input.rewritePlan.rewriteObjective),
    manuscriptBlueprintAvailable: Boolean(input.manuscriptBlueprint),
    criticPriorities: getCriticPriorities(input.criticReports),
    dialogueDensityGuidance: describeDialogueDensity(input.dialogDensity),
    chapterSummary: input.chapter.summary || "",
    previousChapterSummary: input.previousChapterSummary || "",
    nextChapterSummary: input.nextChapterSummary || "",
    chapterDirective,
    characterStateAtThisPoint: firstNonEmptyArray(
      arrayValue(ledger.trackedEntities),
      arrayValue(objectValue(input.manuscriptBlueprint).characters),
    ),
    timelineStateAtThisPoint: firstNonEmptyArray(
      arrayValue(ledger.trackedTimelineFacts),
      arrayValue(objectValue(input.manuscriptBlueprint).timeline),
    ),
    motifsBeforeAndAfter: firstNonEmptyArray(
      arrayValue(ledger.trackedMotifs),
      arrayValue(objectValue(input.manuscriptBlueprint).recurringMotifs),
    ),
    lockedPassages,
    acceptedPriorRevisions,
    continuityWarnings,
    availability: {
      globalObjective: Boolean(stringValue(input.rewritePlan.rewriteObjective)),
      manuscriptBlueprint: Boolean(input.manuscriptBlueprint),
      criticPriorities: input.criticReports.length > 0,
      chapterSummary: Boolean(input.chapter.summary),
      previousChapterSummary: Boolean(input.previousChapterSummary),
      nextChapterSummary: Boolean(input.nextChapterSummary),
      characterStateAtThisPoint: firstNonEmptyArray(
        arrayValue(ledger.trackedEntities),
        arrayValue(objectValue(input.manuscriptBlueprint).characters),
      ).length > 0,
      timelineStateAtThisPoint: firstNonEmptyArray(
        arrayValue(ledger.trackedTimelineFacts),
        arrayValue(objectValue(input.manuscriptBlueprint).timeline),
      ).length > 0,
      motifsBeforeAndAfter: firstNonEmptyArray(
        arrayValue(ledger.trackedMotifs),
        arrayValue(objectValue(input.manuscriptBlueprint).recurringMotifs),
      ).length > 0,
      lockedPassages: lockedPassages.length > 0,
      acceptedPriorRevisions: acceptedPriorRevisions.length > 0,
      continuityWarnings: continuityWarnings.length > 0,
    },
  };
}

function getCriticPriorities(reports: RewriteContextPacketInput["criticReports"]) {
  return reports
    .filter((report) => report.report_type.startsWith("critic:"))
    .slice(0, 7)
    .map((report) => {
      const lens = report.report_type.replace(/^critic:/, "") as CriticLens;
      const label = lens in criticLenses ? criticLenses[lens].label : report.report_type;
      return {
        lens,
        label,
        score: numberValue(report.content?.score),
        summary: summarizeCriticContent(report.content || {}),
      };
    });
}

function getNearbyAcceptedRevisions(input: RewriteContextPacketInput) {
  const paragraphNumbersById = new Map(input.rows.map((row) => [row.id, row.paragraph_number]));
  return input.acceptedRevisions
    .map((revision) => ({
      paragraphId: revision.paragraph_id,
      paragraphNumber: revision.paragraph_id ? paragraphNumbersById.get(revision.paragraph_id) || null : null,
      revisedText: revision.revised_text.slice(0, 1200),
      revisionNotes: revision.revision_notes || "",
      continuityWarnings: revision.continuity_warnings,
      createdAt: revision.created_at || null,
    }))
    .filter((revision) => typeof revision.paragraphNumber === "number")
    .sort((a, b) => Math.abs(Number(a.paragraphNumber) - input.paragraph.paragraph_number) - Math.abs(Number(b.paragraphNumber) - input.paragraph.paragraph_number))
    .slice(0, 6);
}

function getNearbyLockedPassages(input: RewriteContextPacketInput) {
  const lockedParagraphIds = new Set(input.lockedPassages.map((passage) => passage.paragraph_id).filter(Boolean));
  const lockReasons = new Map(input.lockedPassages.map((passage) => [passage.paragraph_id, passage.reason || "Locked passage."]));
  return input.rows
    .filter((row) => row.is_locked || lockedParagraphIds.has(row.id))
    .map((row) => ({
      paragraphId: row.id,
      paragraphNumber: row.paragraph_number,
      reason: lockReasons.get(row.id) || "Locked passage.",
      text: row.original_text.slice(0, 900),
    }))
    .sort((a, b) => Math.abs(a.paragraphNumber - input.paragraph.paragraph_number) - Math.abs(b.paragraphNumber - input.paragraph.paragraph_number))
    .slice(0, 6);
}

function getChapterDirective(plan: Record<string, unknown>, chapterNumber: number) {
  return arrayValue(plan.chapterRewriteDirectives)
    .map((item) => objectValue(item))
    .find((item) => Number(item.chapterNumber) === chapterNumber) || null;
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function firstNonEmptyArray(...values: unknown[][]) {
  return values.find((value) => value.length > 0) || [];
}
