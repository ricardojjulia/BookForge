import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createManagedChatCompletion } from "@/lib/lmstudio/client";
import { parseModelJsonOrFallback } from "@/lib/lmstudio/json";
import { selectAndPrepareActiveModel } from "@/lib/lmstudio/orchestrator";
import { getReasoningModelCandidates } from "@/lib/lmstudio/model-selection";
import { getUserLmStudioSettings } from "@/lib/lmstudio/settings";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  userMessage: z.string().min(1).max(12000),
  mode: z.enum(["ask", "edit", "run", "council"]).optional(),
  scope: z.enum(["whole_book", "chapter", "scene", "selection"]).optional(),
  scopeIds: z.array(z.string().uuid()).max(24).optional(),
});

type ChatMessageRow = {
  role: "user" | "assistant" | "system";
  content: string;
};

type ChatMode = "ask" | "edit" | "run" | "council";

type MetadataProposalChanges = {
  title?: string;
  authorName?: string;
  genre?: string;
  targetAudience?: string;
  pointOfView?: string;
  tense?: string;
};

type MetadataProposal = {
  id: string;
  type: "update_metadata";
  title: string;
  rationale: string;
  changes: MetadataProposalChanges;
};

type RevisionDraftProposalItem = {
  paragraphId?: string;
  chapterNumber?: number;
  paragraphNumber?: number;
  revisedText: string;
  revisionNotes?: string;
};

type RevisionDraftProposal = {
  id: string;
  type: "create_revision_draft";
  title: string;
  rationale: string;
  drafts: RevisionDraftProposalItem[];
};

type EditProposal = MetadataProposal | RevisionDraftProposal;

type ChapterRow = {
  id: string;
  chapter_number: number;
  title: string | null;
  summary: string | null;
};

type ParagraphContextRow = {
  id: string;
  chapter_id: string;
  paragraph_number: number;
  original_text: string;
  current_text: string | null;
  accepted_text: string | null;
};

type DraftRow = {
  paragraph_id: string | null;
  revised_text: string;
  created_at: string;
};

// Synchronous, user-facing wait -- no maxDuration meant this ran under
// Vercel's platform default rather than the 45s client-side SDK timeout,
// which a real cloud-model call can exceed on a slower model/tier. See
// src/lib/critic/run.ts for the incident this pattern traces back to.
export const maxDuration = 150;

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
      .select("id,book_id,title,mode")
      .eq("id", threadId)
      .eq("book_id", bookId)
      .single();

    if (threadError) throw threadError;
    if (!thread) return NextResponse.json({ error: "Chat thread not found." }, { status: 404 });

    const selectedMode = (body.mode || thread.mode) as ChatMode;

    const now = new Date().toISOString();
    const { data: userMsg, error: userMsgError } = await supabase
      .from("chat_messages")
      .insert({
        thread_id: threadId,
        book_id: bookId,
        role: "user",
        content: body.userMessage,
        content_json: {
          mode: selectedMode,
          scope: body.scope || "whole_book",
          scopeIds: body.scopeIds || [],
        },
        status: "completed",
        created_by: user.id,
      })
      .select("id,role,content,created_at")
      .single();

    if (userMsgError) throw userMsgError;

    const [{ data: book }, { data: bible }, { data: chapters }, { data: reports }, { data: recentMessages }, { data: proseParagraphs }, { data: draftRows }] = await Promise.all([
      supabase.from("books").select("id,title,genre,target_audience,point_of_view,tense,status").eq("id", bookId).single(),
      supabase.from("book_bibles").select("content,voice_profile").eq("book_id", bookId).maybeSingle(),
      supabase
        .from("chapters")
        .select("id,chapter_number,title,summary")
        .eq("book_id", bookId)
        .order("chapter_number", { ascending: true })
        .limit(24),
      supabase
        .from("coherence_reports")
        .select("report_type,created_at,content")
        .eq("book_id", bookId)
        .order("created_at", { ascending: false })
        .limit(12),
      supabase
        .from("chat_messages")
        .select("role,content")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("paragraphs")
        .select("id,chapter_id,paragraph_number,original_text,current_text,accepted_text")
        .eq("book_id", bookId)
        .order("chapter_id", { ascending: true })
        .order("paragraph_number", { ascending: true })
        .limit(6000),
      supabase
        .from("revision_versions")
        .select("paragraph_id,revised_text,created_at")
        .eq("book_id", bookId)
        .not("paragraph_id", "is", null)
        .eq("rejected", false)
        .order("created_at", { ascending: false })
        .limit(12000),
    ]);

    if (!book) return NextResponse.json({ error: "Book not found." }, { status: 404 });

    const chapterContext = formatChapterContext((chapters || []) as ChapterRow[]);
    const latestDraftByParagraph = buildLatestDraftByParagraph((draftRows || []) as DraftRow[]);
    const manuscriptProse = formatManuscriptProseContext({
      chapters: (chapters || []) as ChapterRow[],
      paragraphs: (proseParagraphs || []) as ParagraphContextRow[],
      latestDraftByParagraph,
      bookStatus: book.status,
      maxCharacters: 26000,
    });
    const reportContext = formatReportContext(
      (reports || []) as Array<{ report_type: string; created_at: string; content: Record<string, unknown> | null }>,
    );
    const voiceProfile = (bible?.voice_profile && typeof bible.voice_profile === "object"
      ? JSON.stringify(bible.voice_profile, null, 2)
      : "none");
    const bibleDigest = bible?.content ? truncate(JSON.stringify(bible.content), 5000) : "none";

    const snapshotPayload = {
      mode: selectedMode,
      scope: body.scope || "whole_book",
      scopeIds: body.scopeIds || [],
      book: {
        title: book.title,
        genre: book.genre,
        targetAudience: book.target_audience,
        pointOfView: book.point_of_view,
        tense: book.tense,
        status: book.status,
      },
      chapterContext,
      manuscriptProse,
      reportContext,
      bibleDigest,
      voiceProfile,
      recentMessages: (recentMessages || []).slice(0, 8),
      userMessage: body.userMessage,
    };

    const sourceHash = createHash("sha256").update(JSON.stringify(snapshotPayload)).digest("hex");

    const settings = await getUserLmStudioSettings(user.id);
    const modelPlan = await selectAndPrepareActiveModel(settings, {
      task: "planning",
      candidates: getReasoningModelCandidates(settings),
      expectedCalls: 1,
      latencyPreference: "balanced",
      telemetry: { supabase, userId: user.id },
    });

    const conversationMessages: ChatMessageRow[] = (recentMessages || [])
      .slice()
      .reverse()
      .flatMap((message) => {
        if (message.role === "user" || message.role === "assistant" || message.role === "system") {
          return [{ role: message.role, content: truncate(message.content || "", 2400) }];
        }
        return [];
      });

    const completion = await createManagedChatCompletion(modelPlan.client, modelPlan.preparedModel, {
      temperature: Math.min(settings.temperature, selectedMode === "edit" ? 0.35 : 0.5),
      top_p: settings.topP,
      max_tokens: Math.min(settings.maxOutputTokens, selectedMode === "edit" ? 1400 : 2200),
      messages: [
        {
          role: "system",
          content: buildSystemInstruction(selectedMode),
        },
        {
          role: "system",
          content:
            "Book context:\n" +
            `Title: ${book.title}\n` +
            `Genre: ${book.genre || "unset"}\n` +
            `Audience: ${book.target_audience || "unset"}\n` +
            `POV: ${book.point_of_view || "unset"}\n` +
            `Tense: ${book.tense || "unset"}\n` +
            `Book status: ${book.status || "draft"}\n\n` +
            `Blueprint digest:\n${bibleDigest}\n\n` +
            `Voice profile:\n${voiceProfile}\n\n` +
            `Latest manuscript prose (draft/finished snapshot; may be truncated to fit context window):\n${manuscriptProse}\n\n` +
            `Chapter summaries:\n${chapterContext}\n\n` +
            `Recent quality reports:\n${reportContext}`,
        },
        ...conversationMessages,
        {
          role: "user",
          content: body.userMessage,
        },
      ],
    }, undefined, modelPlan.telemetryContext, { timeoutMs: 140_000 });

    const rawAssistantText = completion.choices[0]?.message?.content?.trim() || "I could not produce a response.";
    const editProposal =
      selectedMode === "edit"
        ? extractEditProposal(rawAssistantText)
        : undefined;
    const assistantText =
      selectedMode === "edit"
        ? (editProposal?.summary || rawAssistantText)
        : rawAssistantText;

    const toolSuggestions =
      selectedMode === "run"
        ? getToolSuggestions(body.userMessage)
        : [];

    const contentJson: Record<string, unknown> = {
      mode: selectedMode,
      scope: body.scope || "whole_book",
      scopeIds: body.scopeIds || [],
    };

    if (selectedMode === "edit" && editProposal) {
      contentJson.proposals = editProposal.proposals;
      contentJson.safetyNotes = editProposal.safetyNotes;
    }

    if (selectedMode === "run") {
      contentJson.toolSuggestions = toolSuggestions;
      contentJson.note = "Use Run Mode actions to queue workflows without directly mutating manuscript text.";
    }
    const tokenUsage = completion.usage
      ? {
          promptTokens: completion.usage.prompt_tokens,
          completionTokens: completion.usage.completion_tokens,
          totalTokens: completion.usage.total_tokens,
        }
      : {};

    const { data: assistantMsg, error: assistantMsgError } = await supabase
      .from("chat_messages")
      .insert({
        thread_id: threadId,
        book_id: bookId,
        role: "assistant",
        content: assistantText,
        content_json: contentJson,
        status: "completed",
        token_usage: tokenUsage,
        model_info: {
          providerSource: modelPlan.modelSelection.source,
          model: modelPlan.model,
          selectionReason: modelPlan.modelSelection.selectionReason,
          selectedScore: modelPlan.modelSelection.selectedScore,
        },
      })
      .select("id,role,content,content_json,created_at,token_usage,model_info")
      .single();

    if (assistantMsgError) throw assistantMsgError;

    const { error: snapshotError } = await supabase.from("chat_context_snapshots").insert({
      thread_id: threadId,
      message_id: assistantMsg.id,
      retrieval_manifest: {
        chapterCount: (chapters || []).length,
        paragraphCount: (proseParagraphs || []).length,
        proseCharacters: manuscriptProse.length,
        reportCount: (reports || []).length,
        recentTurns: (recentMessages || []).length,
      },
      token_budget: {
        contextWindowTokens: settings.contextWindowTokens,
        maxOutputTokens: Math.min(settings.maxOutputTokens, 2200),
      },
      source_hash: sourceHash,
    });
    if (snapshotError) throw snapshotError;

    const lastPreview = truncate(assistantText.replace(/\s+/g, " ").trim(), 180);
    const { error: updateThreadError } = await supabase
      .from("chat_threads")
      .update({
        mode: selectedMode,
        last_message_preview: lastPreview,
        last_message_at: now,
        updated_at: now,
      })
      .eq("id", threadId)
      .eq("book_id", bookId);
    if (updateThreadError) throw updateThreadError;

    return NextResponse.json({
      threadId,
      userMessage: userMsg,
      assistantMessage: assistantMsg,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to send chat message." }, { status: 500 });
  }
}

function buildSystemInstruction(mode: ChatMode) {
  if (mode === "edit") {
    return [
      "You are BookForge Copilot for manuscript creation and revision.",
      "Return JSON only with this shape:",
      "{",
      '  "summary": "short explanation",',
      '  "rationale": "why these edits",',
      '  "metadataUpdates": {',
      '    "title": "optional",',
      '    "authorName": "optional",',
      '    "genre": "optional",',
      '    "targetAudience": "optional",',
      '    "pointOfView": "optional",',
      '    "tense": "optional"',
      "  },",
      '  "revisionDrafts": [',
      "    {",
      '      "paragraphId": "optional uuid",',
      '      "chapterNumber": "optional integer when paragraphId missing",',
      '      "paragraphNumber": "optional integer when paragraphId missing",',
      '      "revisedText": "required when draft item exists",',
      '      "revisionNotes": "optional"',
      "    }",
      "  ],",
      '  "safetyNotes": ["strings"]',
      "}",
      "Only include keys that should be changed.",
      "Use revisionDrafts only for explicit rewrite requests.",
      "Never claim that any update was already applied.",
      "revisedText must contain ONLY the final replacement prose for that paragraph -- never a section header, bracketed label, or any commentary describing the change (e.g. do not prefix it with something like '[Merged Chapter 1 & 2]'). Put that kind of explanation in rationale or revisionNotes instead.",
    ].join("\n");
  }

  if (mode === "run") {
    return [
      "You are BookForge Copilot for manuscript creation and revision.",
      "Give concise workflow guidance and suggest which run tools should be used.",
      "Do not claim any workflow was executed.",
    ].join("\n");
  }

  return [
    "You are BookForge Copilot for manuscript creation and revision.",
    "Answer directly, concisely, and context-aware.",
    "Do not claim changes were applied.",
    "Suggest next workflow actions when useful.",
  ].join("\n");
}

function extractEditProposal(raw: string) {
  const parsed = parseModelJsonOrFallback(raw, () => ({
    summary: raw,
    rationale: "No structured proposal was returned.",
    metadataUpdates: {},
    revisionDrafts: [],
    safetyNotes: ["Review carefully before applying."],
  })) as Record<string, unknown>;

  const proposals: EditProposal[] = [];
  const rationale = stringValue(parsed.rationale) || "Align with your latest instructions.";

  const changes = normalizeMetadataChanges(parsed.metadataUpdates);
  if (Object.keys(changes).length) {
    proposals.push({
      id: randomUUID(),
      type: "update_metadata",
      title: "Update book metadata",
      rationale,
      changes,
    });
  }

  const revisionDrafts = normalizeRevisionDrafts(parsed.revisionDrafts);
  if (revisionDrafts.length) {
    proposals.push({
      id: randomUUID(),
      type: "create_revision_draft",
      title: "Create revision draft(s)",
      rationale,
      drafts: revisionDrafts,
    });
  }

  return {
    summary:
      stringValue(parsed.summary) ||
      (proposals.length
        ? "I drafted safe proposals for your review."
        : "I reviewed your request but did not detect a safe proposal to apply."),
    safetyNotes: arrayOfStrings(parsed.safetyNotes).slice(0, 5),
    proposals,
  };
}

function normalizeRevisionDrafts(input: unknown): RevisionDraftProposalItem[] {
  if (!Array.isArray(input)) return [];

  const drafts: RevisionDraftProposalItem[] = [];

  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const paragraphId = stringValue(row.paragraphId);
    const chapterNumber = numberValue(row.chapterNumber);
    const paragraphNumber = numberValue(row.paragraphNumber);
    const revisedText = stringValue(row.revisedText);
    const revisionNotes = stringValue(row.revisionNotes);
    if (!revisedText) continue;
    if (!paragraphId && (!chapterNumber || !paragraphNumber)) continue;

    drafts.push({
      paragraphId: paragraphId || undefined,
      chapterNumber: chapterNumber || undefined,
      paragraphNumber: paragraphNumber || undefined,
      revisedText,
      revisionNotes: revisionNotes || undefined,
    });
  }

  return drafts;
}

function normalizeMetadataChanges(input: unknown): MetadataProposalChanges {
  if (!input || typeof input !== "object") return {};
  const source = input as Record<string, unknown>;
  const result: MetadataProposalChanges = {};

  const title = stringValue(source.title);
  const authorName = stringValue(source.authorName);
  const genre = stringValue(source.genre);
  const targetAudience = stringValue(source.targetAudience);
  const pointOfView = stringValue(source.pointOfView);
  const tense = stringValue(source.tense);

  if (title) result.title = title;
  if (authorName) result.authorName = authorName;
  if (genre) result.genre = genre;
  if (targetAudience) result.targetAudience = targetAudience;
  if (pointOfView) result.pointOfView = pointOfView;
  if (tense) result.tense = tense;

  return result;
}

function getToolSuggestions(message: string) {
  const input = message.toLowerCase();
  const suggestions: string[] = [];
  if (/critic|score|lens|evaluate/.test(input)) suggestions.push("critic_all");
  if (/plan|rewrite architect|strategy/.test(input)) suggestions.push("rewrite_plan");
  if (/human|humanize|friendly|voice guidance/.test(input)) suggestions.push("humanize_guidance");
  if (!suggestions.length) suggestions.push("rewrite_plan", "critic_all", "humanize_guidance");
  return suggestions;
}

function arrayOfStrings(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => stringValue(item)).filter(Boolean)
    : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function formatChapterContext(chapters: ChapterRow[]) {
  if (!chapters.length) return "No chapters yet.";
  return chapters
    .slice(0, 18)
    .map((chapter) => {
      const summary = chapter.summary ? truncate(chapter.summary, 500) : "No summary yet.";
      return `Chapter ${chapter.chapter_number}: ${chapter.title || "Untitled"}\n${summary}`;
    })
    .join("\n\n");
}

function buildLatestDraftByParagraph(rows: DraftRow[]) {
  return rows.reduce<Record<string, string>>((drafts, row) => {
    if (row.paragraph_id && !drafts[row.paragraph_id]) {
      drafts[row.paragraph_id] = row.revised_text;
    }
    return drafts;
  }, {});
}

function formatManuscriptProseContext(input: {
  chapters: ChapterRow[];
  paragraphs: ParagraphContextRow[];
  latestDraftByParagraph: Record<string, string>;
  bookStatus: string | null;
  maxCharacters: number;
}) {
  if (!input.paragraphs.length) return "No manuscript paragraphs available yet.";

  const paragraphsByChapter = input.paragraphs.reduce<Record<string, ParagraphContextRow[]>>((groups, paragraph) => {
    groups[paragraph.chapter_id] ||= [];
    groups[paragraph.chapter_id].push(paragraph);
    return groups;
  }, {});

  const lines: string[] = [];
  for (const chapter of input.chapters) {
    const chapterParagraphs = (paragraphsByChapter[chapter.id] || []).slice().sort((a, b) => a.paragraph_number - b.paragraph_number);
    if (!chapterParagraphs.length) continue;

    lines.push(`Chapter ${chapter.chapter_number}: ${chapter.title || "Untitled"}`);
    for (const paragraph of chapterParagraphs) {
      const text = resolveCurrentManuscriptText(paragraph, input.latestDraftByParagraph, input.bookStatus);
      lines.push(`[P${paragraph.paragraph_number}] ${text}`);
    }
    lines.push("");
  }

  const prose = lines.join("\n").trim();
  return truncate(prose, input.maxCharacters);
}

function resolveCurrentManuscriptText(
  paragraph: ParagraphContextRow,
  latestDraftByParagraph: Record<string, string>,
  bookStatus: string | null,
) {
  if (bookStatus === "finished") {
    return (
      paragraph.accepted_text ||
      paragraph.current_text ||
      latestDraftByParagraph[paragraph.id] ||
      paragraph.original_text
    );
  }

  return (
    latestDraftByParagraph[paragraph.id] ||
    paragraph.current_text ||
    paragraph.accepted_text ||
    paragraph.original_text
  );
}

function formatReportContext(
  reports: Array<{ report_type: string; created_at: string; content: Record<string, unknown> | null }>,
) {
  if (!reports.length) return "No critic/rewrite reports found yet.";

  return reports
    .slice(0, 8)
    .map((report) => {
      const quick = report.content && typeof report.content === "object" ? truncate(JSON.stringify(report.content), 700) : "No content";
      return `${report.report_type} (${new Date(report.created_at).toLocaleString()}): ${quick}`;
    })
    .join("\n\n");
}

function truncate(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 3))}...`;
}
