import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  decisionSelectColumns,
  isMissingMetadataSchema,
  loadAccessibleBook,
  snapshotSelectColumns,
  toDecisionResponse,
  type MetadataDecisionRecord,
} from "@/lib/book-metadata/timeline";

const schema = z.object({
  snapshotId: z.string().uuid(),
  decisionType: z.enum(["accept", "reject", "postpone", "custom"]),
  subjectType: z.enum(["recommendation", "task", "objective", "constraint"]),
  subjectRef: z.string().min(1).max(200),
  rationale: z.string().max(4000).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await params;
    const body = schema.parse(await request.json().catch(() => ({})));
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const book = await loadAccessibleBook(supabase, bookId);
    if (!book) return NextResponse.json({ error: "Book not found." }, { status: 404 });

    const { error: snapshotError } = await supabase
      .from("book_metadata_snapshots")
      .select(snapshotSelectColumns())
      .eq("id", body.snapshotId)
      .eq("book_id", bookId)
      .single();

    if (snapshotError) {
      if (isMissingMetadataSchema(snapshotError)) {
        return NextResponse.json({ error: "Metadata timeline tables are not installed. Run the latest Supabase migrations." }, { status: 503 });
      }
      throw snapshotError;
    }

    const { data: decision, error: decisionError } = await supabase
      .from("book_metadata_decisions")
      .insert({
        book_id: bookId,
        snapshot_id: body.snapshotId,
        decision_type: body.decisionType,
        subject_type: body.subjectType,
        subject_ref: body.subjectRef.trim(),
        rationale: body.rationale?.trim() || null,
        created_by: user.id,
      })
      .select(decisionSelectColumns())
      .single();

    if (decisionError) {
      if (isMissingMetadataSchema(decisionError)) {
        return NextResponse.json({ error: "Metadata timeline tables are not installed. Run the latest Supabase migrations." }, { status: 503 });
      }
      throw decisionError;
    }

    return NextResponse.json({ decision: toDecisionResponse(decision as unknown as MetadataDecisionRecord) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to record metadata decision." }, { status: 500 });
  }
}
