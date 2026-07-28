import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  buildMetadataJson,
  branchSelectColumns,
  isMissingMetadataSchema,
  loadAccessibleBook,
  makeBranchName,
  snapshotSelectColumns,
  toBranchResponse,
  toSnapshotResponse,
  type MetadataSnapshotRecord,
} from "@/lib/book-metadata/timeline";

const schema = z.object({
  branchName: z.string().min(1).max(80).optional(),
  title: z.string().min(1).max(200).optional(),
  summary: z.string().max(4000).optional(),
  metadataJson: z.record(z.string(), z.unknown()).optional(),
  sourceRefId: z.string().uuid().nullable().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ bookId: string; snapshotId: string }> }) {
  try {
    const { bookId, snapshotId } = await params;
    const body = schema.parse(await request.json().catch(() => ({})));
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const book = await loadAccessibleBook(supabase, bookId);
    if (!book) return NextResponse.json({ error: "Book not found." }, { status: 404 });

    const { data: sourceSnapshot, error: sourceError } = await supabase
      .from("book_metadata_snapshots")
      .select(snapshotSelectColumns())
      .eq("id", snapshotId)
      .eq("book_id", bookId)
      .single();

    if (sourceError) {
      if (isMissingMetadataSchema(sourceError)) {
        return NextResponse.json({ error: "Metadata timeline tables are not installed. Run the latest Supabase migrations." }, { status: 503 });
      }
      throw sourceError;
    }

    const targetBranchName = body.branchName?.trim() || makeBranchName(book.title, `fork-${Date.now().toString(36)}`);
    const now = new Date().toISOString();

    const { error: deactivateError } = await supabase
      .from("book_metadata_snapshots")
      .update({ status: "draft", updated_at: now })
      .eq("book_id", bookId)
      .eq("branch_name", targetBranchName)
      .eq("status", "active");
    if (deactivateError) throw deactivateError;

    const { data: snapshot, error: snapshotError } = await supabase
      .from("book_metadata_snapshots")
      .insert({
        book_id: bookId,
        branch_name: targetBranchName,
        parent_snapshot_id: sourceSnapshot.id,
        status: "active",
        title: body.title?.trim() || `${sourceSnapshot.title} fork`,
        summary: body.summary?.trim() || sourceSnapshot.summary || "Forked metadata snapshot.",
        metadata_json: body.metadataJson || sourceSnapshot.metadata_json || buildMetadataJson(book, {
          title: body.title,
          summary: body.summary,
          metadataJson: body.metadataJson,
          sourceType: "manual_edit",
          branchName: targetBranchName,
        }),
        source_type: "manual_edit",
        source_ref_id: body.sourceRefId || null,
        created_by: user.id,
        created_at: now,
        updated_at: now,
      })
      .select(snapshotSelectColumns())
      .single();

    if (snapshotError) throw snapshotError;

    const { data: branch, error: branchError } = await supabase
      .from("book_metadata_branches")
      .upsert(
        {
          book_id: bookId,
          name: targetBranchName,
          head_snapshot_id: snapshot.id,
          is_default: false,
          created_by: user.id,
          updated_at: now,
        },
        { onConflict: "book_id,name" },
      )
      .select(branchSelectColumns())
      .single();

    if (branchError) throw branchError;

    return NextResponse.json({ snapshot: toSnapshotResponse(snapshot as MetadataSnapshotRecord), branch: toBranchResponse(branch), forked: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to fork metadata snapshot." }, { status: 500 });
  }
}
