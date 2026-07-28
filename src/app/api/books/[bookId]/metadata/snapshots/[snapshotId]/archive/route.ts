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

async function archiveSnapshot(bookId: string, snapshotId: string) {
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
  const { data: archivedSnapshot, error: archiveError } = await supabase
    .from("book_metadata_snapshots")
    .update({ status: "archived", archived_at: now, updated_at: now })
    .eq("id", snapshot.id)
    .eq("book_id", bookId)
    .select(snapshotSelectColumns())
    .single();

  if (archiveError) throw archiveError;

  const { data: replacement } = await supabase
    .from("book_metadata_snapshots")
    .select(snapshotSelectColumns())
    .eq("book_id", bookId)
    .eq("branch_name", snapshot.branch_name)
    .neq("id", snapshot.id)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(1);

  const nextHead = Array.isArray(replacement) && replacement.length ? replacement[0] : null;
  const { data: branch, error: branchError } = await supabase
    .from("book_metadata_branches")
    .upsert(
      {
        book_id: bookId,
        name: snapshot.branch_name,
        head_snapshot_id: nextHead ? nextHead.id : null,
        is_default: snapshot.branch_name === "main",
        created_by: user.id,
        updated_at: now,
      },
      { onConflict: "book_id,name" },
    )
    .select(branchSelectColumns())
    .single();

  if (branchError) throw branchError;

  return NextResponse.json({ snapshot: toSnapshotResponse(archivedSnapshot as MetadataSnapshotRecord), branch: toBranchResponse(branch), archived: true });
}

export async function POST(_request: Request, { params }: { params: Promise<{ bookId: string; snapshotId: string }> }) {
  try {
    const { bookId, snapshotId } = await params;
    return await archiveSnapshot(bookId, snapshotId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to archive metadata snapshot." }, { status: 500 });
  }
}
