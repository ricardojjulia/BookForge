import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  branchSelectColumns,
  isMissingMetadataSchema,
  loadAccessibleBook,
  snapshotSelectColumns,
  toBranchResponse,
  toSnapshotResponse,
  type MetadataBranchRecord,
  type MetadataSnapshotRecord,
} from "@/lib/book-metadata/timeline";

const schema = z.object({
  branchName: z.string().min(1).max(80).optional(),
  isDefault: z.boolean().optional(),
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

    const { data: snapshot, error: snapshotError } = await supabase
      .from("book_metadata_snapshots")
      .select(snapshotSelectColumns())
      .eq("id", snapshotId)
      .eq("book_id", bookId)
      .single();

    if (snapshotError) {
      if (isMissingMetadataSchema(snapshotError)) {
        return NextResponse.json({ error: "Metadata timeline tables are not installed. Run the latest Supabase migrations." }, { status: 503 });
      }
      throw snapshotError;
    }

    const snapshotRecord = snapshot as unknown as MetadataSnapshotRecord;

    const targetBranchName = body.branchName?.trim() || snapshotRecord.branch_name;
    const now = new Date().toISOString();

    if (targetBranchName !== snapshotRecord.branch_name) {
      const { error: moveError } = await supabase
        .from("book_metadata_snapshots")
        .update({ branch_name: targetBranchName, updated_at: now })
        .eq("id", snapshotRecord.id)
        .eq("book_id", bookId);
      if (moveError) throw moveError;
    }

    const { error: deactivateError } = await supabase
      .from("book_metadata_snapshots")
      .update({ status: "draft", updated_at: now })
      .eq("book_id", bookId)
      .eq("branch_name", targetBranchName)
      .eq("status", "active");
    if (deactivateError) throw deactivateError;

    const { data: activatedSnapshot, error: activateError } = await supabase
      .from("book_metadata_snapshots")
      .update({ status: "active", updated_at: now })
      .eq("id", snapshotRecord.id)
      .eq("book_id", bookId)
      .select(snapshotSelectColumns())
      .single();

    if (activateError) throw activateError;

    const { data: branch, error: branchError } = await supabase
      .from("book_metadata_branches")
      .upsert(
        {
          book_id: bookId,
          name: targetBranchName,
          head_snapshot_id: snapshotRecord.id,
          is_default: body.isDefault === true || targetBranchName === "main",
          created_by: user.id,
          updated_at: now,
        },
        { onConflict: "book_id,name" },
      )
      .select(branchSelectColumns())
      .single();

    if (branchError) throw branchError;

    return NextResponse.json({
      snapshot: toSnapshotResponse(activatedSnapshot as unknown as MetadataSnapshotRecord),
      branch: toBranchResponse(branch as unknown as MetadataBranchRecord),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to activate metadata snapshot." }, { status: 500 });
  }
}
