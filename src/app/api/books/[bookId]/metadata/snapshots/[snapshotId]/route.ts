import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  branchSelectColumns,
  isMissingMetadataSchema,
  snapshotSelectColumns,
  toBranchResponse,
  toSnapshotResponse,
  type MetadataSnapshotRecord,
} from "@/lib/book-metadata/timeline";

async function softDeleteSnapshot(bookId: string, snapshotId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

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

  const now = new Date().toISOString();
  const { data: deletedSnapshot, error: deleteError } = await supabase
    .from("book_metadata_snapshots")
    .update({ status: "archived", archived_at: now, updated_at: now })
    .eq("id", snapshot.id)
    .eq("book_id", bookId)
    .select(snapshotSelectColumns())
    .single();

  if (deleteError) throw deleteError;

  const { data: branch, error: branchError } = await supabase
    .from("book_metadata_branches")
    .upsert(
      {
        book_id: bookId,
        name: snapshot.branch_name,
        head_snapshot_id: snapshot.id,
        is_default: snapshot.branch_name === "main",
        created_by: user.id,
        updated_at: now,
      },
      { onConflict: "book_id,name" },
    )
    .select(branchSelectColumns())
    .single();

  if (branchError) throw branchError;

  return NextResponse.json({ snapshot: toSnapshotResponse(deletedSnapshot as MetadataSnapshotRecord), branch: toBranchResponse(branch), deleted: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ bookId: string; snapshotId: string }> }) {
  try {
    const { bookId, snapshotId } = await params;
    return await softDeleteSnapshot(bookId, snapshotId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to delete metadata snapshot." }, { status: 500 });
  }
}
