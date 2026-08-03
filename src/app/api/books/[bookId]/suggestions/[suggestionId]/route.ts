import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { createClient } from "@/lib/supabase/server";

const suggestionStatuses = ["accepted", "rejected", "withdrawn", "applied", "superseded"] as const;

const updateSuggestionSchema = z.object({
  status: z.enum(suggestionStatuses),
  reviewNote: z.string().trim().max(4000).optional(),
});

type ApplySuggestionRpcRow = {
  id: string;
  status: string;
  reviewer_id: string | null;
  review_note: string | null;
  suggestion_updated_at: string | null;
  reviewed_at: string | null;
  applied_at: string | null;
  withdrawn_at: string | null;
  paragraph_id: string;
  current_text: string | null;
  accepted_text: string | null;
  paragraph_updated_at: string | null;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ bookId: string; suggestionId: string }> }) {
  try {
    const { bookId, suggestionId } = await params;
    const body = updateSuggestionSchema.parse(await request.json());
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const suggestion = await getSuggestion(supabase, bookId, suggestionId);
    if (!suggestion) return NextResponse.json({ error: "Contributor suggestion not found." }, { status: 404 });

    if (body.status === "applied") {
      if (suggestion.status !== "accepted") {
        return NextResponse.json({ error: "Suggestion must be accepted before it can be applied." }, { status: 409 });
      }
      const canEditBook = await canEditBookForUser(supabase, bookId);
      if (!canEditBook) return NextResponse.json({ error: "You do not have permission to apply this suggestion." }, { status: 403 });
      return await applyAcceptedSuggestion(supabase, { bookId, suggestionId, reviewerId: user.id, reviewNote: body.reviewNote });
    }

    if (suggestion.status !== "proposed") {
      return NextResponse.json({ error: "Only proposed suggestions can change status." }, { status: 409 });
    }
    const isProposer = suggestion.proposer_id === user.id;
    const canEditBook = body.status !== "withdrawn" || !isProposer ? await canEditBookForUser(supabase, bookId) : false;
    if (body.status === "withdrawn" && !isProposer && !canEditBook) {
      return NextResponse.json({ error: "You do not have permission to withdraw this suggestion." }, { status: 403 });
    }
    if (body.status !== "withdrawn" && !canEditBook) {
      return NextResponse.json({ error: "You do not have permission to review this suggestion." }, { status: 403 });
    }

    const now = new Date().toISOString();
    const updatePayload = buildStatusUpdatePayload(body.status, user.id, now, body.reviewNote);
    const { data, error } = await supabase
      .from("creativewriter_contributor_suggestions")
      .update(updatePayload)
      .eq("id", suggestionId)
      .eq("book_id", bookId)
      .select("id,status,reviewer_id,review_note,updated_at,reviewed_at,applied_at,withdrawn_at")
      .single();
    if (error) throw error;

    return NextResponse.json({ suggestion: data });
  } catch (error) {
    return suggestionErrorResponse(error);
  }
}

async function getSuggestion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bookId: string,
  suggestionId: string,
) {
  const { data: suggestion, error } = await supabase
    .from("creativewriter_contributor_suggestions")
    .select("id,proposer_id,status")
    .eq("id", suggestionId)
    .eq("book_id", bookId)
    .maybeSingle();
  if (error) throw error;
  return suggestion;
}

async function canEditBookForUser(supabase: Awaited<ReturnType<typeof createClient>>, bookId: string) {
  const { data: canEdit, error: canEditError } = await supabase.rpc("can_edit_book", { target_book_id: bookId });
  if (canEditError) throw canEditError;
  return canEdit === true;
}

function buildStatusUpdatePayload(status: (typeof suggestionStatuses)[number], userId: string, now: string, reviewNote?: string) {
  return {
    status,
    reviewer_id: status === "withdrawn" ? null : userId,
    review_note: reviewNote || null,
    updated_at: now,
    reviewed_at: status === "withdrawn" ? null : now,
    applied_at: status === "applied" ? now : null,
    withdrawn_at: status === "withdrawn" ? now : null,
  };
}

async function applyAcceptedSuggestion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: { bookId: string; suggestionId: string; reviewerId: string; reviewNote?: string },
) {
  const { data, error } = await supabase
    .rpc("apply_creativewriter_contributor_suggestion", {
      target_book_id: input.bookId,
      target_suggestion_id: input.suggestionId,
      target_reviewer_id: input.reviewerId,
      target_review_note: input.reviewNote || null,
    })
    .single();
  if (error) return applySuggestionErrorResponse(error);
  const applied = data as ApplySuggestionRpcRow;

  return NextResponse.json({
    suggestion: {
      id: applied.id,
      status: applied.status,
      reviewer_id: applied.reviewer_id,
      review_note: applied.review_note,
      updated_at: applied.suggestion_updated_at,
      reviewed_at: applied.reviewed_at,
      applied_at: applied.applied_at,
      withdrawn_at: applied.withdrawn_at,
    },
    paragraph: {
      id: applied.paragraph_id,
      currentText: applied.current_text,
      acceptedText: applied.accepted_text,
      updatedAt: applied.paragraph_updated_at,
    },
  });
}

function applySuggestionErrorResponse(error: unknown) {
  const message = errorMessage(error);
  if (message.includes("permission")) return NextResponse.json({ error: message }, { status: 403 });
  if (message.includes("changed after it was proposed") || message.includes("must be accepted") || message.includes("paragraph-scoped")) {
    return NextResponse.json({ error: message }, { status: 409 });
  }
  if (message.includes("not found")) return NextResponse.json({ error: message }, { status: 404 });
  return NextResponse.json({ error: message }, { status: 500 });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : "Failed.";
}

function suggestionErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Invalid suggestion payload.", details: error.issues }, { status: 400 });
  }
  return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
}
