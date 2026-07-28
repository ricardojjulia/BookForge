import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  messageId: z.string().uuid(),
  proposalId: z.string().min(1),
  applyMode: z.enum(["update_metadata", "create_revision_draft"]).optional(),
  idempotencyKey: z.string().min(1).max(120).optional(),
});

type MetadataProposal = {
  id: string;
  type: "update_metadata";
  title?: string;
  rationale?: string;
  changes?: {
    title?: string;
    authorName?: string;
    genre?: string;
    targetAudience?: string;
    pointOfView?: string;
    tense?: string;
  };
};

type RevisionDraftProposal = {
  id: string;
  type: "create_revision_draft";
  title?: string;
  rationale?: string;
  drafts?: Array<{
    paragraphId?: string;
    chapterNumber?: number;
    paragraphNumber?: number;
    revisedText?: string;
    revisionNotes?: string;
  }>;
};

type ChatProposal = MetadataProposal | RevisionDraftProposal;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookId: string; threadId: string }> },
) {
  try {
    const { bookId, threadId } = await params;
    const body = schema.parse(await request.json().catch(() => ({})));

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: thread, error: threadError } = await supabase
      .from("chat_threads")
      .select("id,book_id")
      .eq("id", threadId)
      .eq("book_id", bookId)
      .single();

    if (threadError) throw threadError;
    if (!thread) return NextResponse.json({ error: "Chat thread not found." }, { status: 404 });

    const { data: message, error: messageError } = await supabase
      .from("chat_messages")
      .select("id,content_json")
      .eq("id", body.messageId)
      .eq("thread_id", threadId)
      .eq("book_id", bookId)
      .single();

    if (messageError) throw messageError;
    if (!message) return NextResponse.json({ error: "Proposal message not found." }, { status: 404 });

    const content = (message.content_json && typeof message.content_json === "object"
      ? message.content_json
      : {}) as Record<string, unknown>;
    const proposals = Array.isArray(content.proposals) ? (content.proposals as ChatProposal[]) : [];
    const proposal = proposals.find((item) => item?.id === body.proposalId);

    if (!proposal) return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
    if (proposal.type !== "update_metadata" && proposal.type !== "create_revision_draft") {
      return NextResponse.json({ error: "Unsupported proposal type." }, { status: 400 });
    }
    if (body.applyMode && body.applyMode !== proposal.type) {
      return NextResponse.json({ error: "Apply mode does not match proposal type." }, { status: 400 });
    }

    const idempotencyFilter = body.idempotencyKey
      ? {
          action: "apply_proposal",
          idempotencyKey: body.idempotencyKey,
        }
      : {
          action: "apply_proposal",
          proposalId: proposal.id,
          applyMode: proposal.type,
        };

    const { data: previousApplyRows, error: previousApplyError } = await supabase
      .from("chat_messages")
      .select("id,role,content,content_json,created_at")
      .eq("thread_id", threadId)
      .eq("book_id", bookId)
      .eq("role", "tool")
      .contains("content_json", idempotencyFilter)
      .order("created_at", { ascending: false })
      .limit(1);
    if (previousApplyError) throw previousApplyError;

    const previousApply = (previousApplyRows || [])[0];
    if (previousApply) {
      return NextResponse.json({
        applied: true,
        idempotent: true,
        applyMode: proposal.type,
        idempotencyKey: body.idempotencyKey || null,
        ...extractApplyMetadata(previousApply.content_json),
        toolMessage: previousApply,
      });
    }

    const now = new Date().toISOString();

    let summary = "";
    let applyMetadata: Record<string, unknown> = {};

    if (proposal.type === "update_metadata") {
      const updatePayload = buildMetadataUpdatePayload(proposal.changes || {});
      if (!Object.keys(updatePayload).length) {
        return NextResponse.json({ error: "No valid metadata changes found in proposal." }, { status: 400 });
      }

      const { error: updateBookError } = await supabase
        .from("books")
        .update({
          ...updatePayload,
          updated_at: now,
        })
        .eq("id", bookId);
      if (updateBookError) throw updateBookError;

      summary = [
        "Applied metadata update proposal.",
        ...Object.entries(updatePayload).map(([key, value]) => `${key}: ${String(value)}`),
      ].join("\n");
      applyMetadata = {
        updatedFields: Object.keys(updatePayload),
        updatedValues: updatePayload,
      };
    }

    if (proposal.type === "create_revision_draft") {
      const draftResult = await createRevisionDrafts({
        supabase,
        bookId,
        userId: user.id,
        proposal,
      });
      summary = [
        "Created revision draft proposal.",
        `Revision job: ${draftResult.revisionJobId}`,
        `Draft versions created: ${draftResult.createdCount}`,
      ].join("\n");
      applyMetadata = {
        revisionJobId: draftResult.revisionJobId,
        createdCount: draftResult.createdCount,
        revisionVersionIds: draftResult.revisionVersionIds,
      };
    }

    const { data: toolMessage, error: toolMessageError } = await supabase
      .from("chat_messages")
      .insert({
        thread_id: threadId,
        book_id: bookId,
        role: "tool",
        content: summary,
        content_json: {
          action: "apply_proposal",
          proposalId: proposal.id,
          applyMode: proposal.type,
          idempotencyKey: body.idempotencyKey || null,
          ...applyMetadata,
        },
        status: "completed",
        created_by: user.id,
      })
      .select("id,thread_id,role,content,content_json,created_at")
      .single();
    if (toolMessageError) throw toolMessageError;

    await supabase
      .from("chat_threads")
      .update({
        last_message_preview: truncate(summary.replace(/\s+/g, " "), 180),
        last_message_at: now,
        updated_at: now,
      })
      .eq("id", threadId)
      .eq("book_id", bookId);

    return NextResponse.json({
      applied: true,
      applyMode: proposal.type,
      idempotencyKey: body.idempotencyKey || null,
      ...applyMetadata,
      toolMessage,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to apply proposal." }, { status: 500 });
  }
}

function buildMetadataUpdatePayload(changes: MetadataProposal["changes"]) {
  const payload: Record<string, string> = {};
  const title = stringValue(changes?.title);
  const authorName = stringValue(changes?.authorName);
  const genre = stringValue(changes?.genre);
  const targetAudience = stringValue(changes?.targetAudience);
  const pointOfView = stringValue(changes?.pointOfView);
  const tense = stringValue(changes?.tense);

  if (title) payload.title = title;
  if (authorName) payload.author_name = authorName;
  if (genre) payload.genre = genre;
  if (targetAudience) payload.target_audience = targetAudience;
  if (pointOfView) payload.point_of_view = pointOfView;
  if (tense) payload.tense = tense;

  return payload;
}

function extractApplyMetadata(contentJson: unknown) {
  if (!contentJson || typeof contentJson !== "object") return {};
  const source = contentJson as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  if (Array.isArray(source.updatedFields)) result.updatedFields = source.updatedFields;
  if (source.updatedValues && typeof source.updatedValues === "object") result.updatedValues = source.updatedValues;
  if (typeof source.revisionJobId === "string") result.revisionJobId = source.revisionJobId;
  if (typeof source.createdCount === "number") result.createdCount = source.createdCount;
  if (Array.isArray(source.revisionVersionIds)) result.revisionVersionIds = source.revisionVersionIds;
  if (typeof source.idempotencyKey === "string") result.idempotencyKey = source.idempotencyKey;

  return result;
}

async function createRevisionDrafts(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  bookId: string;
  userId: string;
  proposal: RevisionDraftProposal;
}) {
  const drafts = Array.isArray(input.proposal.drafts) ? input.proposal.drafts : [];
  if (!drafts.length) {
    throw new Error("No revision drafts found in proposal.");
  }

  const chapterNumberNeeds = Array.from(
    new Set(
      drafts
        .map((draft) => Number(draft.chapterNumber || 0))
        .filter((value) => Number.isFinite(value) && value > 0),
    ),
  );

  const chapterMap = new Map<number, string>();
  if (chapterNumberNeeds.length) {
    const { data: chapterRows, error: chapterError } = await input.supabase
      .from("chapters")
      .select("id,chapter_number")
      .eq("book_id", input.bookId)
      .in("chapter_number", chapterNumberNeeds);
    if (chapterError) throw chapterError;
    for (const row of chapterRows || []) {
      chapterMap.set(Number(row.chapter_number), row.id);
    }
  }

  const resolvedParagraphs: Array<{
    paragraphId: string;
    chapterId: string;
    sceneId: string | null;
    originalText: string;
    revisedText: string;
    revisionNotes: string;
    paragraphNumber: number;
  }> = [];

  for (const draft of drafts) {
    const revisedText = stringValue(draft.revisedText);
    if (!revisedText) continue;

    let paragraphRow:
      | {
          id: string;
          chapter_id: string;
          scene_id: string | null;
          paragraph_number: number;
          original_text: string;
          is_locked: boolean | null;
        }
      | null = null;

    const directParagraphId = stringValue(draft.paragraphId);
    if (directParagraphId) {
      const { data, error } = await input.supabase
        .from("paragraphs")
        .select("id,chapter_id,scene_id,paragraph_number,original_text,is_locked")
        .eq("book_id", input.bookId)
        .eq("id", directParagraphId)
        .maybeSingle();
      if (error) throw error;
      paragraphRow = data;
    } else {
      const chapterId = chapterMap.get(Number(draft.chapterNumber || 0));
      const paragraphNumber = Number(draft.paragraphNumber || 0);
      if (chapterId && paragraphNumber > 0) {
        const { data, error } = await input.supabase
          .from("paragraphs")
          .select("id,chapter_id,scene_id,paragraph_number,original_text,is_locked")
          .eq("book_id", input.bookId)
          .eq("chapter_id", chapterId)
          .eq("paragraph_number", paragraphNumber)
          .maybeSingle();
        if (error) throw error;
        paragraphRow = data;
      }
    }

    if (!paragraphRow) {
      throw new Error("One or more revision draft targets could not be resolved to a paragraph.");
    }
    if (paragraphRow.is_locked) {
      throw new Error(`Paragraph ${paragraphRow.paragraph_number} is locked and cannot receive draft rewrites.`);
    }

    resolvedParagraphs.push({
      paragraphId: paragraphRow.id,
      chapterId: paragraphRow.chapter_id,
      sceneId: paragraphRow.scene_id,
      originalText: paragraphRow.original_text,
      revisedText,
      revisionNotes: stringValue(draft.revisionNotes) || stringValue(input.proposal.rationale) || "Chat proposal draft rewrite.",
      paragraphNumber: paragraphRow.paragraph_number,
    });
  }

  if (!resolvedParagraphs.length) {
    throw new Error("No valid revision drafts could be created from proposal.");
  }

  const now = new Date().toISOString();
  const { data: revisionJob, error: revisionJobError } = await input.supabase
    .from("revision_jobs")
    .insert({
      book_id: input.bookId,
      mode: "chat_revision_draft_apply",
      status: "completed",
      settings: {
        source: "chat_apply",
        proposalId: input.proposal.id,
        draftCount: resolvedParagraphs.length,
      },
      prompt_snapshot: "Chat apply: create revision draft proposal",
      created_by: input.userId,
      started_at: now,
      completed_at: now,
    })
    .select("id")
    .single();
  if (revisionJobError) throw revisionJobError;

  const versionRows = resolvedParagraphs.map((draft) => ({
    revision_job_id: revisionJob.id,
    book_id: input.bookId,
    chapter_id: draft.chapterId,
    scene_id: draft.sceneId,
    paragraph_id: draft.paragraphId,
    original_text: draft.originalText,
    revised_text: draft.revisedText,
    revision_notes: draft.revisionNotes,
    continuity_warnings: [],
  }));

  const { data: insertedVersions, error: versionError } = await input.supabase
    .from("revision_versions")
    .insert(versionRows)
    .select("id");
  if (versionError) throw versionError;

  return {
    revisionJobId: revisionJob.id,
    createdCount: versionRows.length,
    revisionVersionIds: (insertedVersions || []).map((row) => row.id),
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function truncate(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 3))}...`;
}
