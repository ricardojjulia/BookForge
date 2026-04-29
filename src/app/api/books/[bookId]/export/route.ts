import { NextResponse } from "next/server";
import { z } from "zod";
import { buildFinalManuscriptDocx } from "@/lib/export/docx";
import { buildFinalManuscriptEpub } from "@/lib/export/epub";
import { buildFinalManuscriptPdf } from "@/lib/export/pdf";
import {
  buildFinalManuscriptMarkdown,
  type FinalManuscriptSourceMode,
  type LatestDraftByParagraph,
} from "@/lib/export/markdown";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  format: z.enum(["markdown", "docx", "epub", "pdf"]).default("markdown"),
  sourceMode: z.enum(["accepted", "latest", "original"]).default("accepted"),
  includeFrontMatter: z.boolean().default(true),
  includeBackMatter: z.boolean().default(true),
  useOriginalForLocked: z.boolean().default(true),
  abridgedMode: z.boolean().default(false),
  preview: z.boolean().default(false),
  epubMetadata: z
    .object({
      language: z.string().optional(),
      publisher: z.string().optional(),
      copyright: z.string().optional(),
      description: z.string().optional(),
    })
    .optional(),
  pdfOptions: z
    .object({
      fontSize: z.number().min(9).max(14).optional(),
      lineGap: z.number().min(0).max(8).optional(),
      pageNumbers: z.boolean().optional(),
      pageSize: z.enum(["LETTER", "A4"]).optional(),
    })
    .optional(),
});

type ParagraphRevision = {
  paragraph_id: string | null;
  revised_text: string;
  created_at: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unable to export manuscript.";
}

export async function POST(request: Request, context: { params: Promise<{ bookId: string }> }) {
  const supabase = await createClient();

  try {
    const { bookId } = await context.params;
    const options = schema.parse(await request.json());
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const [{ data: book, error: bookError }, { data: chapters, error: chaptersError }, { data: paragraphs, error: paragraphsError }, { data: matterSections, error: matterError }] =
      await Promise.all([
        supabase.from("books").select("id,title,author_name").eq("id", bookId).single(),
        supabase
          .from("chapters")
          .select("id,chapter_number,title,section_type,exclude_from_export")
          .eq("book_id", bookId)
          .order("chapter_number"),
        supabase
          .from("paragraphs")
          .select("id,chapter_id,scene_id,paragraph_number,original_text,current_text,accepted_text,is_locked")
          .eq("book_id", bookId)
          .order("paragraph_number"),
        supabase
          .from("book_matter_sections")
          .select("section_type,title,content,sort_order")
          .eq("book_id", bookId)
          .order("sort_order"),
      ]);

    if (bookError) throw bookError;
    if (chaptersError) throw chaptersError;
    if (paragraphsError) throw paragraphsError;
    if (matterError) throw matterError;
    if (!book) return NextResponse.json({ error: "Book not found." }, { status: 404 });

    const latestDraftsByParagraph =
      options.sourceMode === "latest"
        ? await getLatestDraftsByParagraph(supabase, bookId)
        : {};
    const exportChapters = (chapters || []).filter((chapter) => !chapter.exclude_from_export);
    const exportChapterIds = new Set(exportChapters.map((chapter) => chapter.id));
    const approvedCuts = options.abridgedMode ? await getApprovedAbridgementCuts(supabase, bookId) : null;
    const exportParagraphs = approvedCuts
      ? (paragraphs || []).filter(
          (paragraph) =>
            exportChapterIds.has(paragraph.chapter_id) &&
            !approvedCuts.chapterIds.has(paragraph.chapter_id) &&
            !approvedCuts.sceneIds.has(paragraph.scene_id || "") &&
            !approvedCuts.paragraphIds.has(paragraph.id),
        )
      : (paragraphs || []).filter((paragraph) => exportChapterIds.has(paragraph.chapter_id));

    const exportInput = {
      book,
      chapters: exportChapters,
      paragraphs: exportParagraphs,
      matterSections: matterSections || [],
      latestDraftsByParagraph,
      sourceMode: options.sourceMode as FinalManuscriptSourceMode,
      includeFrontMatter: options.includeFrontMatter,
      includeBackMatter: options.includeBackMatter,
      useOriginalForLocked: options.useOriginalForLocked,
      abridgedMode: options.abridgedMode,
    };

    const markdownPreview = buildFinalManuscriptMarkdown(exportInput);
    if (options.preview) {
      const acceptedCount = (paragraphs || []).filter((paragraph) => paragraph.accepted_text).length;
      const lockedCount = (paragraphs || []).filter((paragraph) => paragraph.is_locked).length;
      return NextResponse.json({
        content: {
          format: options.format,
          sourceMode: options.sourceMode,
          paragraphCount: paragraphs?.length || 0,
          exportedParagraphCount: exportParagraphs.length,
          abridgedMode: options.abridgedMode,
          approvedCutCount: approvedCuts?.count || 0,
          chapterCount: exportChapters.length,
          characterCount: markdownPreview.length,
          previewText: markdownPreview.slice(0, 50000),
          truncated: markdownPreview.length > 50000,
          warnings: buildPreviewWarnings({
            format: options.format,
            sourceMode: options.sourceMode,
            acceptedCount,
            paragraphCount: paragraphs?.length || 0,
            exportedParagraphCount: exportParagraphs.length,
            abridgedMode: options.abridgedMode,
            approvedCutCount: approvedCuts?.count || 0,
            lockedCount,
            useOriginalForLocked: options.useOriginalForLocked,
          }),
        },
      });
    }

    const file =
      options.format === "docx"
        ? {
            body: await buildFinalManuscriptDocx(exportInput),
            extension: "docx",
            contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          }
        : options.format === "epub"
          ? {
              body: await buildFinalManuscriptEpub(exportInput, options.epubMetadata),
              extension: "epub",
              contentType: "application/epub+zip",
            }
          : options.format === "pdf"
            ? {
                body: await buildFinalManuscriptPdf(exportInput, options.pdfOptions),
                extension: "pdf",
                contentType: "application/pdf",
              }
        : {
            body: markdownPreview,
            extension: "md",
            contentType: "text/markdown; charset=utf-8",
          };

    const { data: exportRow, error: exportError } = await supabase
      .from("exports")
      .insert({
        book_id: bookId,
        format: options.format,
        status: "pending",
        metadata: {
          sourceMode: options.sourceMode,
          includeFrontMatter: options.includeFrontMatter,
          includeBackMatter: options.includeBackMatter,
          useOriginalForLocked: options.useOriginalForLocked,
          abridgedMode: options.abridgedMode,
          approvedCutCount: approvedCuts?.count || 0,
          paragraphCount: paragraphs?.length || 0,
          exportedParagraphCount: exportParagraphs.length,
          chapterCount: exportChapters.length,
          excludedChapterCount: (chapters || []).length - exportChapters.length,
          characterCount: markdownPreview.length,
          warnings: buildPreviewWarnings({
            format: options.format,
            sourceMode: options.sourceMode,
            acceptedCount: (paragraphs || []).filter((paragraph) => paragraph.accepted_text).length,
            paragraphCount: paragraphs?.length || 0,
            exportedParagraphCount: exportParagraphs.length,
            abridgedMode: options.abridgedMode,
            approvedCutCount: approvedCuts?.count || 0,
            lockedCount: (paragraphs || []).filter((paragraph) => paragraph.is_locked).length,
            useOriginalForLocked: options.useOriginalForLocked,
          }),
        },
      })
      .select("id")
      .single();
    if (exportError) throw exportError;

    const storagePath = `${user.id}/${bookId}/${exportRow.id}.${file.extension}`;
    const { error: uploadError } = await supabase.storage.from("exports").upload(storagePath, file.body, {
      contentType: file.contentType,
      upsert: true,
    });
    if (uploadError) throw uploadError;

    const { error: updateError } = await supabase
      .from("exports")
      .update({
        storage_path: storagePath,
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", exportRow.id);
    if (updateError) throw updateError;

    const { data: signedUrl } = await supabase.storage.from("exports").createSignedUrl(storagePath, 60 * 10);

    return NextResponse.json({
      content: {
        exportId: exportRow.id,
        format: options.format,
        storagePath,
        signedUrl: signedUrl?.signedUrl || null,
        sourceMode: options.sourceMode,
        paragraphCount: exportParagraphs.length,
        abridgedMode: options.abridgedMode,
        approvedCutCount: approvedCuts?.count || 0,
        chapterCount: exportChapters.length,
      },
    });
  } catch (error) {
    console.error("Final manuscript export failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

async function getApprovedAbridgementCuts(supabase: Awaited<ReturnType<typeof createClient>>, bookId: string) {
  const { data, error } = await supabase
    .from("abridgement_suggestions")
    .select("suggestion_type,chapter_id,scene_id,paragraph_id")
    .eq("book_id", bookId)
    .eq("status", "approved");
  if (error) throw error;

  const cuts = {
    chapterIds: new Set<string>(),
    sceneIds: new Set<string>(),
    paragraphIds: new Set<string>(),
    count: 0,
  };

  for (const row of data || []) {
    if (row.suggestion_type === "cut_chapter" && row.chapter_id) {
      cuts.chapterIds.add(row.chapter_id);
      cuts.count += 1;
    }
    if (row.suggestion_type === "cut_scene" && row.scene_id) {
      cuts.sceneIds.add(row.scene_id);
      cuts.count += 1;
    }
    if ((row.suggestion_type === "cut_paragraph" || row.suggestion_type === "tighten_paragraph") && row.paragraph_id) {
      cuts.paragraphIds.add(row.paragraph_id);
      cuts.count += 1;
    }
  }

  return cuts;
}

function buildPreviewWarnings(input: {
  format: string;
  sourceMode: string;
  acceptedCount: number;
  paragraphCount: number;
  exportedParagraphCount: number;
  abridgedMode: boolean;
  approvedCutCount: number;
  lockedCount: number;
  useOriginalForLocked: boolean;
}) {
  const warnings: string[] = [];
  const acceptedPercent = input.paragraphCount ? Math.round((input.acceptedCount / input.paragraphCount) * 100) : 0;

  if (input.sourceMode === "accepted" && acceptedPercent < 80) {
    warnings.push(
      `Only ${acceptedPercent}% of paragraphs have accepted revisions. Unaccepted paragraphs will use original manuscript text.`,
    );
  }
  if (input.sourceMode === "latest") {
    warnings.push("Latest draft mode can include unaccepted rewrite drafts.");
  }
  if (["epub", "pdf"].includes(input.format) && input.sourceMode !== "accepted") {
    warnings.push(`${input.format.toUpperCase()} exports are usually safest from accepted revisions, not draft or original source modes.`);
  }
  if (input.format === "epub" && acceptedPercent < 90) {
    warnings.push("For Kindle/KDP review, aim for at least 90% accepted coverage before creating the EPUB.");
  }
  if (input.format === "docx" && acceptedPercent < 80) {
    warnings.push("DOCX is a good editing handoff format, but this export still contains substantial original fallback text.");
  }
  if (input.abridgedMode && input.approvedCutCount === 0) {
    warnings.push("Abridged mode is enabled, but no approved abridgement cuts were found.");
  }
  if (input.abridgedMode && input.exportedParagraphCount === input.paragraphCount) {
    warnings.push("Abridged mode did not reduce the exported paragraph count.");
  }
  if (input.lockedCount > 0 && !input.useOriginalForLocked) {
    warnings.push("Locked passages are not forced to original text in this preview.");
  }

  return warnings;
}

async function getLatestDraftsByParagraph(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bookId: string,
): Promise<LatestDraftByParagraph> {
  const { data, error } = await supabase
    .from("revision_versions")
    .select("paragraph_id,revised_text,created_at")
    .eq("book_id", bookId)
    .not("paragraph_id", "is", null)
    .eq("rejected", false)
    .order("created_at", { ascending: false });
  if (error) throw error;

  return ((data || []) as ParagraphRevision[]).reduce<LatestDraftByParagraph>((drafts, revision) => {
    if (revision.paragraph_id && !drafts[revision.paragraph_id]) {
      drafts[revision.paragraph_id] = revision.revised_text;
    }
    return drafts;
  }, {});
}
